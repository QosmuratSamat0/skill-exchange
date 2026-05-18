# pairexx — Anonymous Chat & Matchmaking Platform

[![Go Version](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go)](https://golang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-24.0+-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![Terraform](https://img.shields.io/badge/Terraform-1.0+-7B42BC?style=flat-square&logo=terraform)](https://www.terraform.io/)

pairexx is a high-performance, production-grade microservices platform for real-time anonymous text and voice communication. Built with **Go** (backend), **Next.js** (frontend), deployed on **Oracle Cloud Infrastructure** via **Terraform**.

---

## Architecture Overview

The system follows a microservices architecture with all services communicating over an isolated Docker network (`pairexx-network`). Only the API Gateway is exposed to the public internet via Nginx Proxy Manager.

```
┌─────────────────────────────────────────────────────┐
│                    Internet                         │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  Nginx Proxy    │
              │   Manager       │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   API Gateway   │  :8080
              └────────┬────────┘
                       │  pairexx-network
        ┌──────────────┼──────────────────┐
        │              │                  │
┌───────▼──────┐ ┌─────▼──────┐ ┌────────▼────────┐
│ user-service │ │chat-service│ │matchmaking-svc  │
│    :8081     │ │   :8083    │ │     :8082       │
└──────────────┘ └────────────┘ └─────────────────┘
        │              │
┌───────▼──────────────▼───────┐
│   pairexx-postgres  :5432    │
│   pairexx-redis     :6379    │
└──────────────────────────────┘
```

### Services

| Service | Port | Description |
|---|---|---|
| api-gateway | 8080 | Central entry point, request routing |
| user-service | 8081 | Authentication & profile management |
| matchmaking-service | 8082 | User matching algorithms |
| chat-service | 8083 | Real-time WebSocket messaging |
| moderation-service | 8084 | Content filtering & reporting |
| notification-service | 8085 | Internal event notifications |

### Infrastructure

| Component | Technology |
|---|---|
| Backend | Go 1.25 / Chi v5 |
| Frontend | Next.js 15 |
| Database | PostgreSQL 16 / Redis 7 |
| WebRTC | Coturn (STUN/TURN) |
| Monitoring | Prometheus / Grafana / Node Exporter |
| IaC | Terraform (Oracle Cloud / OCI) |
| Reverse Proxy | Nginx Proxy Manager |

---

## Prerequisites

- **Docker & Docker Compose v2+** — required
- **Go 1.25+** — only if running services locally without Docker
- **Node.js 20+** & **npm** — only if running frontend locally
- **Make** — optional, used as a shortcut for Docker Compose commands

---

## Local Setup

### 1. Clone & Configure Environment

```bash
git clone https://github.com/QosmuratSamat0/anon.git
cd anon
cp .env.example .env
# Edit .env with your values
```

### 2. Start Infrastructure (PostgreSQL, Redis, Coturn)

**With Make:**
```bash
make up-infra
```

**Without Make (Docker Compose directly):**
```bash
docker compose -f docker-compose.infra.yml up -d
```

This also starts `Nginx Proxy Manager` (NPM) on:
- `http://<server-ip>:81` (admin)
- `http://<server-ip>:80` (HTTP proxy)
- `https://<server-ip>:443` (HTTPS proxy)

### 3. Run Database Migrations

**With Make:**
```bash
make migrate
```

**Without Make:**
```bash
docker compose -f docker-compose.infra.yml run --rm migrate
```

### 4. Start All Microservices

**With Make:**
```bash
make up-services
```

**Without Make:**
```bash
docker compose -f docker-compose.services.yml up -d
```

### 5. Start Monitoring Stack (Optional)

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

### 6. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Makefile Commands

| Command | Docker Compose Equivalent | Description |
|---|---|---|
| `make up` | `docker compose -f docker-compose.infra.yml -f docker-compose.services.yml up -d` | Start all backend containers |
| `make up-infra` | `docker compose -f docker-compose.infra.yml up -d` | Start PostgreSQL, Redis, Coturn |
| `make up-services` | `docker compose -f docker-compose.services.yml up -d` | Start all microservices |
| `make down` | `docker compose -f docker-compose.infra.yml -f docker-compose.services.yml down` | Stop and remove all containers |
| `make migrate` | `docker compose -f docker-compose.infra.yml run --rm migrate` | Run database migrations |
| `make logs-services` | `docker compose -f docker-compose.services.yml logs -f` | Tail logs for Go services |
| `make logs-infra` | `docker compose -f docker-compose.infra.yml logs -f` | View logs for DBs & Redis |

---

## Project Structure

```
├── api-gateway/              # Central entry point & routing
├── user-service/             # Authentication & profile management
├── chat-service/             # Real-time WebSocket messaging
├── matchmaking-service/      # User matching algorithms
├── moderation-service/       # Content filtering & reporting
├── notification-service/     # Internal event notifications
├── frontend/                 # Next.js web application
├── docker/
│   └── postgres/init/        # DB initialization scripts
├── terraform/                # OCI Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   ├── setup.sh
│   ├── outputs.tf
│   └── terraform.tfvars
├── monitoring/
│   └── prometheus/           # Prometheus config & scrape targets
├── docker-compose.infra.yml  # PostgreSQL, Redis, Coturn
├── docker-compose.services.yml # All microservices
├── docker-compose.monitoring.yml # Prometheus, Grafana, Node Exporter
├── Makefile
└── .env.example
```

---

## Service Endpoints (Local)

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:8080 |
| Nginx Proxy Manager Admin | http://localhost:81 |

### Domain setup with Nginx Proxy Manager

1. Point DNS records:
- `A  @` -> your server public IP
- `A  api` -> your server public IP

2. Open NPM admin (`http://<server-ip>:81`) and login.

3. Create Proxy Host for frontend:
- Domain: `your-domain.com`
- Forward host: `host.docker.internal` (or your frontend host)
- Forward port: `3000`
- Enable SSL and request Let's Encrypt cert

4. Create Proxy Host for API/WebSocket:
- Domain: `api.your-domain.com`
- Forward host: `api-gateway`
- Forward port: `8080`
- Enable Websockets support
- Enable SSL and request Let's Encrypt cert

---

## Monitoring & Observability

The monitoring stack uses Prometheus for metrics collection and Grafana for visualization.

**Prometheus** scrapes metrics from all 6 microservices and the API Gateway via `/metrics` endpoints on their respective ports.

**Grafana** dashboards include:
- Service availability (up/down status per service)
- Node Exporter: CPU, RAM, Disk, Network for the host machine

To verify all services are UP:
1. Open Prometheus through an SSH tunnel or internal access path
2. All `pairexx-services` targets should show state `UP`

---

## Infrastructure as Code (Terraform)

The server is provisioned on **Oracle Cloud Infrastructure (OCI)** using Terraform. See [`terraform/`](./terraform/) for full configuration.

### Provisioned Resources

- Compute Instance: `VM.Standard.E2.1.Micro` (Always Free tier)
- OS: Ubuntu 24.04 LTS
- Region: EU Stockholm (eu-stockholm-1)

### Open Ports (Security Rules)

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH management |
| 80 | TCP | HTTP / API Gateway |
| 443 | TCP | HTTPS |
| 81 | TCP | Nginx Proxy Manager admin |

Grafana and Prometheus should stay bound to `127.0.0.1` unless you intentionally place them behind VPN, SSH tunneling, or an allowlisted reverse proxy.

### Deploy Infrastructure

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Fill in your OCI credentials

terraform init
terraform plan
terraform apply
```

After apply, the public IP is printed as output: `instance_public_ip`.

---

## Configuration & Deployment (Ansible)

Ansible is used to automate server configuration and application deployment.

### 1. Prerequisites
- Ansible installed on your local machine.
- SSH access to the provisioned server.

### 2. Configure Inventory
Update `ansible/inventory.ini` with your server's public IP:
```ini
[servers]
server1 ansible_host=YOUR_SERVER_IP ansible_user=ubuntu
```

### 3. Run Playbook
To configure the server (Docker, Swap, Git) and deploy the application:
```bash
cd ansible
ansible-playbook playbook.yml
```

**Tags:**
- `setup`: Run only server configuration tasks.
- `deploy`: Run only application deployment tasks.

Example (only deploy):
```bash
ansible-playbook playbook.yml --tags deploy
```

---

Refer to [DEPLOYMENT.md](/terraform/DEPLOYMENT.md) for OCI cloud deployment details.

---

## CI/CD

GitHub Actions workflows are located in `.github/workflows/`. The pipeline handles automated building and image publishing to `ghcr.io/QosmuratSamat0/`.

---

## License

This project is for educational and demonstration purposes. All rights reserved.

