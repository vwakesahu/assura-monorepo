
## ROFL TEE Deployment Guide

This guide covers how to set up, deploy, restart, and update the ROFL (Remote On-chain Function Library) TEE application.

### Prerequisites

- Docker installed and running
- Docker Hub account (username: `0xswayam`)
- Oasis CLI (`oasis`) installed and configured
- Oasis account with sufficient TEST tokens for staking

### Initial Setup

#### 1. Configure Docker Image

The `compose.yaml` file references a Docker image that must be publicly accessible on Docker Hub.

**Update the image name in `compose.yaml`:**
```yaml
image: "docker.io/0xswayam/my-app:latest"
```

Replace `0xswayam` with your Docker Hub username if different.

#### 2. Create Dockerfile

Ensure you have a `Dockerfile` in the `tee/` directory. A basic template is provided that you can customize based on your application needs.

#### 3. Build and Push Docker Image

Build your Docker image:
```bash
cd tee/
docker build -t 0xswayam/my-app:latest .
```

Push to Docker Hub:
```bash
docker login  # Enter your Docker Hub credentials
docker push 0xswayam/my-app:latest
```

**Important:** Make the repository public on Docker Hub:
1. Go to https://hub.docker.com/r/0xswayam/my-app
2. Navigate to Settings → Visibility
3. Select "Make public"
4. Confirm the change

This is required for ROFL to pull the image during deployment.

#### 4. Build ROFL Application

Build the ROFL application bundle:
```bash
docker run --platform linux/amd64 --volume .:/src -it ghcr.io/oasisprotocol/rofl-dev:main oasis rofl build
```

If you encounter image validation errors during development, you can skip validation with:
```bash
docker run --platform linux/amd64 --volume .:/src -it ghcr.io/oasisprotocol/rofl-dev:main oasis rofl build --force
```

#### 5. Deploy to ROFL

Deploy the application:
```bash
oasis rofl deploy
```

You'll be prompted to:
- Unlock your account (enter passphrase)
- Confirm deployment details

The deployment will:
- Push the ROFL app to the OCI repository (`rofl.sh`)
- Create/update the machine configuration
- Deploy your container to the TEE

### Checking Deployment Status

**View application information:**
```bash
oasis rofl show
```

**View machine status:**
```bash
oasis rofl machine show
```

**View machine logs:**
```bash
oasis rofl machine logs
```

Note: If you see "Machine is missing scheduler RAK metadata" error, the machine may need to be restarted (see Restart section below).

### Restarting the Server

To restart the machine (useful if logs are inaccessible or after configuration changes):

```bash
oasis rofl machine restart
```

You'll be prompted to:
- Unlock your account (enter passphrase)
- Confirm restart (with option to wipe storage)

**Restart options:**
- Default restart: Keeps all data and volumes
- Restart with storage wipe: `oasis rofl machine restart --wipe-storage` (⚠️ This will delete all persistent data)

**Other machine management commands:**
```bash
# Stop the machine
oasis rofl machine stop

# Start a stopped machine
oasis rofl machine restart
```

### Updating the Server

To update your ROFL application with new code or configuration:

#### 1. Update Your Application Code

Make changes to your application files, `Dockerfile`, or `compose.yaml` as needed.

#### 2. Rebuild and Push Docker Image

After making changes, rebuild and push the updated image:
```bash
docker build -t 0xswayam/my-app:latest .
docker push 0xswayam/my-app:latest
```

#### 3. Rebuild ROFL Application

Rebuild the ROFL bundle:
```bash
docker run --platform linux/amd64 --volume .:/src -it ghcr.io/oasisprotocol/rofl-dev:main oasis rofl build
```

#### 4. Update Deployment

Update the deployed application:
```bash
oasis rofl update
```

You'll be prompted to unlock your account. The update will:
- Push the new ROFL app bundle
- Update the machine with the new configuration
- Restart containers if needed

#### 5. Restart Machine (if needed)

After updating, restart the machine to ensure changes take effect:
```bash
oasis rofl machine restart
```

### Configuration Files

- **`rofl.yaml`**: Main ROFL application configuration
  - App metadata (name, version)
  - Resource requirements (memory, CPU, storage)
  - Deployment settings (network, paratime, policy)
  - Machine configuration

- **`compose.yaml`**: Docker Compose configuration
  - Container services
  - Volumes and environment variables
  - Image references

- **`Dockerfile`**: Container image definition
  - Base image and dependencies
  - Application code and entrypoint

### Troubleshooting

**Docker image authentication errors:**
- Ensure the Docker Hub repository is set to public
- Verify the image name matches your Docker Hub username

**Machine logs inaccessible:**
- Restart the machine: `oasis rofl machine restart`
- Wait a few minutes after deployment for machine initialization

**Deployment timeout:**
- Check your internet connection
- Verify Docker Hub repository is public
- Try deploying again (network issues can be transient)

**RAK metadata errors:**
- Restart the machine to sync metadata
- Ensure the machine status is "accepted" or "running"

### Useful Commands Reference

```bash
# Build ROFL app
docker run --platform linux/amd64 --volume .:/src -it ghcr.io/oasisprotocol/rofl-dev:main oasis rofl build

# Deploy
oasis rofl deploy

# Update
oasis rofl update

# Machine management
oasis rofl machine show          # Show machine status
oasis rofl machine logs          # View logs
oasis rofl machine restart       # Restart machine
oasis rofl machine stop          # Stop machine

# Application info
oasis rofl show                  # Show app details
oasis rofl trust-root            # Show trust root
```

### Current Configuration

- **App ID**: `rofl1qq8ee7kzg37mkvmhc06gcz5ugz5qm55qgv34aath`
- **Network**: Testnet
- **ParaTime**: Sapphire
- **TEE**: Intel TDX
- **Machine ID**: `0000000000000451`
- **Docker Image**: `docker.io/0xswayam/my-app:latest`