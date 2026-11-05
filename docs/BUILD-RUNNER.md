# Build Runner: Donna's Computer (donnas-pc)

Dedicated local build node and GitHub Actions self-hosted runner for RobinTHood.

## Node Specifications
- **Local IP:** `192.168.1.203` (DHCP, formerly `.171`)
- **User:** `disci`
- **OS:** Windows 11 Home (AMD64)
- **Drive C (NVMe SSD):** `SK hynix BC711` (105+ GB free) — Dedicated build workspace (`C:\actions-runner\_work`)
- **Drive D (SATA HDD):** `WDC WD10EZEX` (916+ GB free) — Runner binary installation (`D:\actions-runner`)

## Access
Passwordless SSH key authentication is configured:
```bash
ssh -o BatchMode=yes disci@192.168.1.203
```

Send PowerShell commands non-interactively via stdin:
```bash
ssh -o BatchMode=yes disci@192.168.1.171 "powershell -NoProfile -" << 'EOF'
Get-Service -Name "actions.runner.*"
EOF
```

## Toolchain
- **Node.js:** `v24.22.1`
- **Java JDK:** `Microsoft.OpenJDK.17` (`C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot`)
- **Git:** `2.56.0`
- **Python:** `3.12.10`
- **Package Manager:** `winget` (`v1.29`)

## GitHub Actions Runner
- **Status:** Registered to `edotwedo/RobinTHood` as runner `donnas-pc`
- **Labels:** `self-hosted`, `Windows`, `X64`, `donnas-pc`
- **Service:** Windows Scheduled Task `GitHubActionsRunner` running as `SYSTEM` on boot.
- **Workflow Usage:**
  ```yaml
  runs-on: [self-hosted, donnas-pc]
  ```
- **Check Status via CLI:**
  ```bash
  gh api repos/edotwedo/RobinTHood/actions/runners
  ```
