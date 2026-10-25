# GitHub, CI/CD and deployment

## Repository

The local Git repository is in `bridge-demo`, with origin `https://github.com/leadinggene-netizen/rearepo1025.git` and branch `feature/bridge-demo`. The supplied remote was empty when inspected. Vendor reverse-engineering case files sit outside this repository and must stay there.

Review before first publication:

```powershell
git status --short
git diff --cached --stat
git remote -v
```

If publishing manually after reviewing, create a commit of the authored source and push the feature branch, then open a pull request in GitHub. On an empty repository the first push creates its initial branch; choose the long-term default branch deliberately in GitHub. No remote deployment is performed by running the local preview.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests. It installs .NET 10 and Node 22, restores the package-free server, builds with warnings as errors, checks browser JavaScript, runs real loopback HTTP/SignalR tests, and uploads the published server, EA source and docs as a workflow artifact.

MT5 compilation is not claimed by the Linux CI job. Add a trusted, licensed Windows runner with MetaEditor if automated EA compilation is needed. Do not put a broker password or live-account terminal on that runner. Compile the source without attaching it to a chart. The documented MetaEditor command is:

```powershell
& 'C:\Path\To\MetaEditor64.exe' /compile:'C:\Path\To\RelayDemo.mq5' /include:'C:\Path\To\MQL5' /log
```

Inspect the generated log; a process exit alone does not establish a successful MQL5 compilation.

## Packaging

The Dockerfile builds a .NET 10 image. The manual container workflow publishes a commit-SHA tag to `ghcr.io/leadinggene-netizen/rearepo1025` using GitHub's built-in package token. It does not automatically deploy. Check the CI workflow before manually publishing an image.

The application enforces loopback clients. The container is therefore a local packaging starting point, not a public web service. On Linux, a host-network run can preserve the loopback boundary; provision a writable `/data` directory for the image's unprivileged UID and retain it across restarts. On Windows, use the native preview script. Port publishing alone does not remove the application-level loopback check.

## Before a public TradingView integration

This is future work, not configuration already supplied by the demo:

1. Separate public webhook ingress from operator/terminal interfaces; deploy HTTPS with deliberate network and proxy trust rules. Keep the admin portal private.
2. Replace the single local connection with tenant/account authorization, scoped credential issuance/rotation and audited access. Encrypt stored secrets with a managed key service.
3. Use a transactional database and durable command/result records. Add reconciliation against broker trade identifiers; do not promise exactly-once trading on the basis of message delivery.
4. Add bounded authenticated ingress, request-rate controls, operator auditing, backup/restore and retention tests. Ensure logs redact tokens and webhook secrets.
5. Add a remote terminal transport (HTTPS polling or a SignalR companion) with explicit endpoint configuration, account binding and connection ownership. The current EA is intentionally limited to the local URL.
6. Publish immutable releases, test migrations and rollback, and require a reviewed demo-account acceptance test before broker-capable changes are released.

Only after that work should the TradingView alert use a public webhook URL. The JSON field `secret` is supported because TradingView cannot normally add an arbitrary authentication header. Use a stable unique event ID; scope it by strategy and event type to avoid collisions. Do not turn every simulated `sell` fill into a short entry when the strategy intended to close a long.

## State and secrets

`data/state.json` contains generated keys and account metadata. `.gitignore` and `.dockerignore` exclude it. `.tools` contains local SDK/compiler copies; these are not redistributed. The included SignalR browser dependency retains its Microsoft MIT license. Rebuild rather than copying arbitrary local runtime directories into deployment images.
