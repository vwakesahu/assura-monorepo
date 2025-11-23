# ROFL TEE Server

Simple Express TypeScript server running in Oasis ROFL TEE.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build TypeScript:
```bash
npm run build
```

3. Start server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

- `GET /` - Service information
- `GET /health` - Health check
- `POST /summarize-doc` - Submit document for processing
  - Body: `{ "document": "..." }`
  - Returns: `{ "job_id": "...", "status": "processing", "status_url": "/summarize-doc/{job_id}" }`
- `GET /summarize-doc/:jobId` - Get job status and result

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (default: production)

## Deployment

Build and deploy to Oasis ROFL:
```bash
oasis rofl build
oasis rofl deploy
```

## Proxy & Custom Domain

The ROFL proxy automatically generates HTTPS URLs for exposed ports. Port 3000 is configured for proxy access.

### Getting the Proxy URL

After deployment, get the proxy URL:
```bash
oasis rofl machine show
```

Look for the `Proxy` section in the output:
```
Proxy:
  Domain: m602.test-proxy-b.rofl.app
  Ports from compose file:
    3000 (app): https://p3000.m602.test-proxy-b.rofl.app
```

### Setting up Custom Domain (tee.assura.network)

The custom domain `tee.assura.network` is configured in `compose.yaml`. To complete the setup:

1. **Deploy the updated configuration:**
   ```bash
   oasis rofl build
   oasis rofl deploy
   ```

2. **Get the machine IP and verification TXT record:**
   After deployment, check the output or run:
   ```bash
   oasis rofl machine show
   ```
   Look for the machine IP address and any TXT record requirements for domain verification.

3. **Configure DNS records:**
   - **A Record:** `tee.assura.network` → `<machine-ip-address>`
   - **TXT Record:** Create the TXT record as specified in the deployment output for domain verification

4. **Access your service:**
   Once DNS propagates (5-60 minutes), access at: `https://tee.assura.network`

The proxy handles TLS certificate generation and termination automatically for your custom domain.
