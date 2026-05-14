#!/usr/bin/env bash

set -Eeuo pipefail

###############################################################################
# Lead Panel Ubuntu 24.04 PM2 Deployment Script
#
# Purpose:
#   Provision a fresh Ubuntu 24.04 VPS for two sites on the same box:
#
#     1. Public root domain (default example.com, optionally www.example.com)
#        -> static one-page portfolio served by Nginx from
#           /var/www/lead-panel-landing (synced from this repo's `landing/` dir).
#
#     2. Private panel/admin subdomain (default panel.example.com)
#        -> Lead Panel React app + Express API, reverse proxied by Nginx to
#           the Node app on 127.0.0.1:3000. APP_BASE_URL is set to this
#           subdomain.
#
#   The script also installs Node.js LTS, PostgreSQL, Redis, Nginx, Certbot,
#   PM2, configures the database, writes .env, builds the app, runs Prisma
#   migrations + admin seed, starts API and worker with PM2, and (optionally)
#   provisions HTTPS for both domains via Certbot.
#
# Run from the project root after uploading/extracting lead-panel:
#   chmod +x scripts/deploy-ubuntu-24-pm2.sh
#   sudo ./scripts/deploy-ubuntu-24-pm2.sh
#
###############################################################################

APP_NAME="lead-panel"
DEFAULT_APP_DIR="/opt/lead-panel"
DEFAULT_NODE_MAJOR="24"
APP_PORT="3000"
DB_NAME="leadpanel"
DB_USER="leadpanel"
REDIS_URL_DEFAULT="redis://127.0.0.1:6379"
GENERATED_SITES_DIR_DEFAULT="/var/lib/lead-panel/generated-sites"

DEFAULT_ROOT_DOMAIN="example.com"
DEFAULT_PANEL_DOMAIN="panel.example.com"
LANDING_WEBROOT_DEFAULT="/var/www/lead-panel-landing"

LANDING_NGINX_NAME="lead-panel-landing"
PANEL_NGINX_NAME="lead-panel"

log() {
  printf "\n\033[1;34m[lead-panel]\033[0m %s\n" "$*"
}

warn() {
  printf "\n\033[1;33m[warning]\033[0m %s\n" "$*"
}

fail() {
  printf "\n\033[1;31m[error]\033[0m %s\n" "$*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Please run this script with sudo or as root."
  fi
}

prompt() {
  local label="$1"
  local default="${2:-}"
  local value

  if [[ -n "${default}" ]]; then
    read -r -p "${label} [${default}]: " value
    printf "%s" "${value:-$default}"
  else
    read -r -p "${label}: " value
    printf "%s" "$value"
  fi
}

prompt_secret() {
  local label="$1"
  local value
  read -r -s -p "${label}: " value
  printf "\n" >&2
  printf "%s" "$value"
}

yes_no() {
  local label="$1"
  local default="${2:-y}"
  local value
  read -r -p "${label} [${default}]: " value
  value="${value:-$default}"
  [[ "${value}" =~ ^[Yy]$|^[Yy][Ee][Ss]$ ]]
}

random_hex() {
  openssl rand -hex 32
}

env_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "${value}"
}

ensure_project_root() {
  if [[ ! -f "package.json" ]] || [[ ! -d "server" ]] || [[ ! -d "client" ]] || [[ ! -d "prisma" ]]; then
    fail "Run this script from the Lead Panel project root, or choose to copy this directory to the app path when prompted."
  fi
  if [[ ! -d "landing" ]]; then
    warn "No landing/ directory found. The public root-domain site will not be deployed."
  fi
}

install_base_packages() {
  log "Installing base packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    unzip \
    rsync \
    git \
    build-essential \
    openssl \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx \
    postgresql \
    postgresql-contrib \
    redis-server
}

install_nodejs() {
  local node_major="$1"
  log "Installing Node.js ${node_major}.x from NodeSource"

  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

  printf "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n" "${node_major}" \
    > /etc/apt/sources.list.d/nodesource.list

  apt-get update
  apt-get install -y nodejs

  log "Node installed: $(node --version)"
  log "npm installed: $(npm --version)"
}

install_pm2() {
  log "Installing PM2 globally"
  npm install -g pm2
  pm2 --version
}

setup_services() {
  log "Enabling PostgreSQL, Redis, and Nginx"
  systemctl enable --now postgresql
  systemctl enable --now redis-server
  systemctl enable --now nginx
}

setup_firewall() {
  if yes_no "Configure UFW firewall to allow SSH, HTTP, and HTTPS?" "y"; then
    log "Configuring UFW"
    ufw allow OpenSSH || true
    ufw allow 'Nginx Full' || true
    ufw --force enable
    ufw status
  else
    warn "Skipping firewall setup. Ensure ports 22, 80, and 443 are configured safely."
  fi
}

copy_project_if_needed() {
  local app_dir="$1"
  local current_dir
  current_dir="$(pwd)"

  if [[ "${current_dir}" == "${app_dir}" ]]; then
    log "Project already located at ${app_dir}"
    return
  fi

  if [[ -e "${app_dir}" ]]; then
    if yes_no "${app_dir} already exists. Sync current project files into it with rsync?" "y"; then
      log "Syncing project to ${app_dir}"
      mkdir -p "${app_dir}"
      rsync -a --delete \
        --exclude node_modules \
        --exclude dist \
        --exclude .env \
        --exclude .git \
        --exclude generated-sites \
        "${current_dir}/" "${app_dir}/"
    else
      fail "App directory exists and sync was declined."
    fi
  else
    log "Copying project to ${app_dir}"
    mkdir -p "${app_dir}"
    rsync -a \
      --exclude node_modules \
      --exclude dist \
      --exclude .env \
      --exclude .git \
      --exclude generated-sites \
      "${current_dir}/" "${app_dir}/"
  fi
}

deploy_landing_site() {
  local app_dir="$1"
  local landing_webroot="$2"

  local src
  if [[ -d "${app_dir}/landing" ]]; then
    src="${app_dir}/landing"
  elif [[ -d "$(pwd)/landing" ]]; then
    src="$(pwd)/landing"
  else
    warn "No landing/ directory found at ${app_dir}/landing or current dir; skipping landing deploy."
    return
  fi

  log "Publishing landing site to ${landing_webroot} (from ${src})"
  mkdir -p "${landing_webroot}"
  rsync -a --delete \
    --exclude README.md \
    "${src}/" "${landing_webroot}/"

  chown -R www-data:www-data "${landing_webroot}"
  find "${landing_webroot}" -type d -exec chmod 0755 {} \;
  find "${landing_webroot}" -type f -exec chmod 0644 {} \;
}

setup_postgres() {
  local db_password="$1"

  log "Configuring PostgreSQL database and user"
  sudo -u postgres psql <<SQL
DO
\$do\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${db_password}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${db_password}';
  END IF;
END
\$do\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
}

write_env_file() {
  local app_dir="$1"
  local panel_domain="$2"
  local app_base_url="$3"
  local db_password="$4"
  local session_secret="$5"
  local admin_email="$6"
  local admin_password="$7"
  local anthropic_key="$8"
  local anthropic_model="$9"
  local openrouter_key="${10}"
  local openrouter_model="${11}"
  local google_places_key="${12}"
  local serpapi_key="${13}"
  local vercel_token="${14}"
  local vercel_team_id="${15}"
  local vercel_project_prefix="${16}"
  local generated_sites_dir="${17}"

  log "Writing ${app_dir}/.env (APP_BASE_URL=${app_base_url})"

  cat > "${app_dir}/.env" <<ENV
NODE_ENV=production
PORT=${APP_PORT}
APP_BASE_URL=$(env_quote "${app_base_url}")

POSTGRES_PASSWORD=$(env_quote "${db_password}")
DATABASE_URL=$(env_quote "postgresql://${DB_USER}:${db_password}@127.0.0.1:5432/${DB_NAME}?schema=public")
REDIS_URL=$(env_quote "${REDIS_URL_DEFAULT}")

SESSION_SECRET=$(env_quote "${session_secret}")
ADMIN_EMAIL=$(env_quote "${admin_email}")
ADMIN_PASSWORD=$(env_quote "${admin_password}")

ANTHROPIC_API_KEY=$(env_quote "${anthropic_key}")
ANTHROPIC_MODEL=$(env_quote "${anthropic_model}")

OPENROUTER_API_KEY=$(env_quote "${openrouter_key}")
OPENROUTER_MODEL=$(env_quote "${openrouter_model}")

GOOGLE_PLACES_API_KEY=$(env_quote "${google_places_key}")
SERPAPI_API_KEY=$(env_quote "${serpapi_key}")

VERCEL_API_TOKEN=$(env_quote "${vercel_token}")
VERCEL_TEAM_ID=$(env_quote "${vercel_team_id}")
VERCEL_PROJECT_PREFIX=$(env_quote "${vercel_project_prefix}")

EMAIL_PROVIDER=
RESEND_API_KEY=
POSTMARK_SERVER_TOKEN=
FROM_EMAIL=

GENERATED_SITES_DIR=$(env_quote "${generated_sites_dir}")
ENV

  chmod 600 "${app_dir}/.env"
  mkdir -p "${generated_sites_dir}"
  chown -R root:root "${generated_sites_dir}"

  if [[ -z "${panel_domain}" ]]; then
    warn "No panel domain configured. APP_BASE_URL is ${app_base_url}."
  fi
}

install_and_build_app() {
  local app_dir="$1"

  log "Installing dependencies and building app"
  cd "${app_dir}"

  npm ci
  npm run typecheck
  npm run lint
  npm run build
  npx prisma generate
  npm run prisma:migrate
  npm run db:seed
}

configure_pm2() {
  local app_dir="$1"

  log "Starting app and worker with PM2"
  cd "${app_dir}"

  pm2 delete "${APP_NAME}-app" >/dev/null 2>&1 || true
  pm2 delete "${APP_NAME}-worker" >/dev/null 2>&1 || true

  pm2 start npm --name "${APP_NAME}-app" -- run start
  pm2 start npm --name "${APP_NAME}-worker" -- run worker

  pm2 save

  local startup_output
  startup_output="$(pm2 startup systemd -u root --hp /root || true)"
  printf "%s\n" "${startup_output}"

  systemctl enable pm2-root || true
}

configure_nginx_landing() {
  local root_domain="$1"
  local include_www="$2"
  local landing_webroot="$3"

  if [[ -z "${root_domain}" ]]; then
    warn "No root domain configured; skipping landing Nginx site."
    rm -f "/etc/nginx/sites-enabled/${LANDING_NGINX_NAME}"
    return
  fi

  log "Configuring Nginx for landing site (${root_domain})"

  local server_names="${root_domain}"
  if [[ "${include_www}" == "yes" ]]; then
    server_names="${root_domain} www.${root_domain}"
  fi

  cat > "/etc/nginx/sites-available/${LANDING_NGINX_NAME}" <<NGINX
# Public root-domain landing site for ${root_domain}.
# Static files only — no admin app, no API keys.
server {
    listen 80;
    listen [::]:80;
    server_name ${server_names};

    root ${landing_webroot};
    index index.html;

    # Long cache for static assets, short for HTML
    location ~* \\.(?:css|js|svg|png|jpe?g|webp|avif|ico|woff2?)$ {
        expires 7d;
        access_log off;
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Reasonable security headers for a static site
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "interest-cohort=(), browsing-topics=()" always;
}
NGINX

  ln -sfn "/etc/nginx/sites-available/${LANDING_NGINX_NAME}" \
    "/etc/nginx/sites-enabled/${LANDING_NGINX_NAME}"
}

configure_nginx_panel() {
  local panel_domain="$1"

  log "Configuring Nginx reverse proxy for panel (${panel_domain:-IP-only})"

  local server_name="_"
  if [[ -n "${panel_domain}" ]]; then
    server_name="${panel_domain}"
  fi

  cat > "/etc/nginx/sites-available/${PANEL_NGINX_NAME}" <<NGINX
# Private admin panel for Lead Panel — reverse proxy to Node on 127.0.0.1:${APP_PORT}.
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

  ln -sfn "/etc/nginx/sites-available/${PANEL_NGINX_NAME}" \
    "/etc/nginx/sites-enabled/${PANEL_NGINX_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
}

configure_certbot() {
  local root_domain="$1"
  local include_www="$2"
  local panel_domain="$3"
  local certbot_email="$4"

  local -a domain_args=()

  if [[ -n "${root_domain}" ]]; then
    domain_args+=("-d" "${root_domain}")
    if [[ "${include_www}" == "yes" ]]; then
      domain_args+=("-d" "www.${root_domain}")
    fi
  fi

  if [[ -n "${panel_domain}" ]]; then
    domain_args+=("-d" "${panel_domain}")
  fi

  if [[ ${#domain_args[@]} -eq 0 ]]; then
    warn "Skipping Certbot because no domains were provided."
    return
  fi

  if [[ -z "${certbot_email}" ]]; then
    warn "Skipping Certbot because no email address was provided."
    return
  fi

  local prompt_label="Issue and install Let's Encrypt SSL certificates for:"
  if [[ -n "${root_domain}" ]]; then
    prompt_label+=" ${root_domain}"
    [[ "${include_www}" == "yes" ]] && prompt_label+=", www.${root_domain}"
  fi
  if [[ -n "${panel_domain}" ]]; then
    prompt_label+=", ${panel_domain}"
  fi
  prompt_label+="? DNS must already point to this VPS."

  if yes_no "${prompt_label}" "y"; then
    log "Requesting Let's Encrypt certificate(s)"
    certbot --nginx \
      "${domain_args[@]}" \
      --email "${certbot_email}" \
      --agree-tos \
      --redirect \
      --non-interactive

    systemctl reload nginx
  else
    warn "Skipping SSL certificate setup. Run certbot later once DNS is ready."
  fi
}

health_check() {
  log "Running local health check"
  sleep 3

  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null; then
    log "Panel health check passed: http://127.0.0.1:${APP_PORT}/api/health"
  else
    warn "Panel health check failed. Inspect logs with: pm2 logs"
  fi
}

print_summary() {
  local app_dir="$1"
  local app_base_url="$2"
  local root_domain="$3"
  local include_www="$4"
  local panel_domain="$5"
  local landing_webroot="$6"

  log "Deployment complete"

  local root_url=""
  if [[ -n "${root_domain}" ]]; then
    root_url="https://${root_domain}"
  fi

  cat <<SUMMARY

App directory:
  ${app_dir}

Public landing site (root domain):
  ${root_url:-(not configured)}
  Web root: ${landing_webroot}
  Nginx site: /etc/nginx/sites-available/${LANDING_NGINX_NAME}

Private admin panel (subdomain):
  ${app_base_url}
  Reverse proxy to: http://127.0.0.1:${APP_PORT}
  Nginx site: /etc/nginx/sites-available/${PANEL_NGINX_NAME}

PM2 commands:
  pm2 status
  pm2 logs ${APP_NAME}-app
  pm2 logs ${APP_NAME}-worker
  pm2 restart ${APP_NAME}-app ${APP_NAME}-worker

Nginx commands:
  nginx -t
  systemctl reload nginx
  journalctl -u nginx -f

Database:
  PostgreSQL database: ${DB_NAME}
  PostgreSQL user:     ${DB_USER}

Re-publishing landing-only changes:
  rsync -a --delete --exclude README.md ${app_dir}/landing/ ${landing_webroot}/
  systemctl reload nginx

Next steps:
  1. Visit ${root_url:-the root domain} and confirm the landing page loads.
  2. Visit ${app_base_url} and log in with the admin credentials you entered.
  3. Add a Google Business Profile / Google Maps URL.
  4. Pull lead info, generate and deploy a demo site.
  5. Generate a sales pitch for the lead.

SUMMARY

  if [[ -n "${root_domain}" || -n "${panel_domain}" ]]; then
    cat <<DNS
DNS records required (A or AAAA records pointing to this VPS):
  ${root_domain:-<root domain>}              -> this VPS
$(
  if [[ "${include_www}" == "yes" && -n "${root_domain}" ]]; then
    printf "  www.%s          -> this VPS (optional, recommended)\n" "${root_domain}"
  fi
)  ${panel_domain:-<panel domain>}    -> this VPS

If a site is unreachable, confirm DNS, then check:
  certbot certificates
  systemctl status nginx
  pm2 status
DNS
  fi
}

main() {
  require_root
  ensure_project_root

  log "Lead Panel Ubuntu 24.04 PM2 deployment"

  local app_dir
  local root_domain
  local include_www_answer
  local include_www="no"
  local panel_domain
  local certbot_email
  local node_major
  local app_base_url
  local landing_webroot
  local db_password
  local session_secret
  local admin_email
  local admin_password
  local anthropic_key
  local anthropic_model
  local openrouter_key
  local openrouter_model
  local google_places_key
  local serpapi_key
  local vercel_token
  local vercel_team_id
  local vercel_project_prefix
  local generated_sites_dir

  app_dir="$(prompt "Install/sync project to directory" "${DEFAULT_APP_DIR}")"

  log "Domain configuration"
  printf "  The root domain serves the public one-page landing site.\n"
  printf "  The panel subdomain serves the private admin app + workers.\n"

  root_domain="$(prompt "Public root domain (serves landing page). Leave blank to skip" "${DEFAULT_ROOT_DOMAIN}")"

  if [[ -n "${root_domain}" ]]; then
    if yes_no "Also serve www.${root_domain} as an alias for the landing page?" "y"; then
      include_www="yes"
    else
      include_www="no"
    fi
    landing_webroot="$(prompt "Landing site web root on the VPS" "${LANDING_WEBROOT_DEFAULT}")"
    if [[ "${landing_webroot}" != /* ]]; then
      warn "Landing webroot '${landing_webroot}' is not an absolute path; using default ${LANDING_WEBROOT_DEFAULT}"
      landing_webroot="${LANDING_WEBROOT_DEFAULT}"
    fi
  else
    landing_webroot="${LANDING_WEBROOT_DEFAULT}"
  fi

  panel_domain="$(prompt "Panel/admin subdomain (reverse proxy to localhost:${APP_PORT}). Leave blank for IP-only HTTP" "${DEFAULT_PANEL_DOMAIN}")"

  if [[ -n "${panel_domain}" ]]; then
    app_base_url="https://${panel_domain}"
  else
    app_base_url="$(prompt "APP_BASE_URL for IP-only deployment" "http://$(curl -fsS https://api.ipify.org || echo localhost):${APP_PORT}")"
  fi

  if [[ -n "${root_domain}" || -n "${panel_domain}" ]]; then
    certbot_email="$(prompt "Email for Let's Encrypt expiry/security notices" "")"
    if [[ -z "${certbot_email}" ]]; then
      warn "Certbot will be skipped without an email address."
    fi
  else
    certbot_email=""
  fi

  node_major="$(prompt "Node.js major version to install via NodeSource" "${DEFAULT_NODE_MAJOR}")"
  db_password="$(prompt_secret "PostgreSQL password for ${DB_USER}")"
  [[ -n "${db_password}" ]] || db_password="$(random_hex)"
  if [[ ! "${db_password}" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    fail "PostgreSQL password may only contain letters, numbers, dot, underscore, tilde, and hyphen. Re-run and leave blank to auto-generate a safe password."
  fi

  session_secret="$(prompt_secret "SESSION_SECRET. Leave blank to generate one")"
  [[ -n "${session_secret}" ]] || session_secret="$(random_hex)"

  admin_email="$(prompt "Initial admin email" "admin@example.com")"
  admin_password="$(prompt_secret "Initial admin password")"
  [[ -n "${admin_password}" ]] || fail "Admin password is required."

  anthropic_key="$(prompt_secret "ANTHROPIC_API_KEY. Leave blank to use mock/local fallback")"
  anthropic_model="$(prompt "ANTHROPIC_MODEL" "claude-3-5-sonnet-latest")"

  openrouter_key="$(prompt_secret "OPENROUTER_API_KEY. Leave blank to use mock sales-pitch fallback")"
  openrouter_model="$(prompt "OPENROUTER_MODEL" "openrouter/auto")"

  google_places_key="$(prompt_secret "GOOGLE_PLACES_API_KEY. Leave blank if using SerpAPI or mock fallback")"
  serpapi_key="$(prompt_secret "SERPAPI_API_KEY. Leave blank if using Google Places or mock fallback")"

  vercel_token="$(prompt_secret "VERCEL_API_TOKEN. Leave blank to use mock Vercel URLs")"
  vercel_team_id="$(prompt "VERCEL_TEAM_ID. Leave blank if not using a Vercel team" "")"
  vercel_project_prefix="$(prompt "VERCEL_PROJECT_PREFIX" "lead-demo")"
  generated_sites_dir="$(prompt "Generated sites directory" "${GENERATED_SITES_DIR_DEFAULT}")"

  install_base_packages
  install_nodejs "${node_major}"
  install_pm2
  setup_services
  setup_firewall
  copy_project_if_needed "${app_dir}"
  deploy_landing_site "${app_dir}" "${landing_webroot}"
  setup_postgres "${db_password}"
  write_env_file \
    "${app_dir}" \
    "${panel_domain}" \
    "${app_base_url}" \
    "${db_password}" \
    "${session_secret}" \
    "${admin_email}" \
    "${admin_password}" \
    "${anthropic_key}" \
    "${anthropic_model}" \
    "${openrouter_key}" \
    "${openrouter_model}" \
    "${google_places_key}" \
    "${serpapi_key}" \
    "${vercel_token}" \
    "${vercel_team_id}" \
    "${vercel_project_prefix}" \
    "${generated_sites_dir}"
  install_and_build_app "${app_dir}"
  configure_pm2 "${app_dir}"
  configure_nginx_landing "${root_domain}" "${include_www}" "${landing_webroot}"
  configure_nginx_panel "${panel_domain}"
  configure_certbot "${root_domain}" "${include_www}" "${panel_domain}" "${certbot_email}"
  health_check
  print_summary "${app_dir}" "${app_base_url}" "${root_domain}" "${include_www}" "${panel_domain}" "${landing_webroot}"
}

main "$@"
