# PowerShell script to ensure Docker is running before starting the server

Write-Host "[INFO] Checking Docker Desktop status..." -ForegroundColor Cyan

# Check if Docker Desktop is running
$dockerRunning = $false
try {
    $null = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
        Write-Host "[OK] Docker Desktop is running" -ForegroundColor Green
    }
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-Host "[WARN] Docker Desktop is not running. Starting it..." -ForegroundColor Yellow
    
    # Try to start Docker Desktop
    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "[WAIT] Waiting for Docker Desktop to start (this may take 30-60 seconds)..." -ForegroundColor Yellow
        
        # Wait for Docker to be ready (max 2 minutes)
        $timeout = 120
        $elapsed = 0
        $interval = 5
        
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds $interval
            $elapsed += $interval
            
            try {
                $null = docker ps 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "[OK] Docker Desktop is now running!" -ForegroundColor Green
                    $dockerRunning = $true
                    break
                }
            } catch {
                # Docker not ready yet
            }
            
            Write-Host "   Still waiting... $elapsed seconds elapsed" -ForegroundColor Gray
        }
        
        if (-not $dockerRunning) {
            Write-Host "[ERROR] Docker Desktop failed to start. Please start it manually and try again." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[ERROR] Docker Desktop not found at: $dockerPath" -ForegroundColor Red
        Write-Host "   Please install Docker Desktop or update the path in this script." -ForegroundColor Yellow
        exit 1
    }
}

# Check if PostgreSQL container is running
Write-Host "[INFO] Checking PostgreSQL container..." -ForegroundColor Cyan
$containerRunning = docker ps --filter "name=yogurt-postgres" --format "{{.Names}}" 2>&1

if ($containerRunning -notlike "*yogurt-postgres*") {
    Write-Host "[WARN] PostgreSQL container is not running. Starting it..." -ForegroundColor Yellow
    
    # Navigate to project root
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Set-Location $projectRoot
    
    # Start the container
    docker-compose up -d postgres
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[WAIT] Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        
        # Wait for container to be healthy
        $timeout = 60
        $elapsed = 0
        $interval = 2
        
        while ($elapsed -lt $timeout) {
            $status = docker ps --filter "name=yogurt-postgres" --format "{{.Status}}" 2>&1
            if ($status -like "*healthy*") {
                Write-Host "[OK] PostgreSQL container is ready!" -ForegroundColor Green
                break
            }
            Start-Sleep -Seconds $interval
            $elapsed += $interval
        }
    } else {
        Write-Host "[ERROR] Failed to start PostgreSQL container" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] PostgreSQL container is running" -ForegroundColor Green
}

# Function to test PostgreSQL port connectivity
function Test-PostgresPort {
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect("localhost", 5435, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(2000, $false)
        if ($wait) {
            $tcpClient.EndConnect($connect)
            $tcpClient.Close()
            return $true
        } else {
            $tcpClient.Close()
            return $false
        }
    } catch {
        return $false
    }
}

# Verify PostgreSQL port is actually accessible
Write-Host "[INFO] Verifying PostgreSQL port 5435 is accessible..." -ForegroundColor Cyan
$portAccessible = $false
$retries = 0
$maxRetries = 15

while (-not $portAccessible -and $retries -lt $maxRetries) {
    $portAccessible = Test-PostgresPort
    if (-not $portAccessible) {
        $retries++
        if ($retries -lt $maxRetries) {
            Write-Host "   Port 5435 not accessible yet, retrying... ($retries/$maxRetries)" -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $portAccessible) {
    Write-Host "[ERROR] Cannot connect to PostgreSQL on port 5435 after $maxRetries attempts." -ForegroundColor Red
    Write-Host "   Please check:" -ForegroundColor Yellow
    Write-Host "   1. Docker Desktop is running: docker ps" -ForegroundColor Yellow
    Write-Host "   2. Container is running: docker ps --filter 'name=yogurt-postgres'" -ForegroundColor Yellow
    Write-Host "   3. Container is healthy: docker ps --filter 'name=yogurt-postgres' --format '{{.Status}}'" -ForegroundColor Yellow
    Write-Host "   4. Container logs: docker logs yogurt-postgres" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "[OK] PostgreSQL port 5435 is accessible" -ForegroundColor Green
}

# Check if port 5000 is in use
Write-Host "[INFO] Checking if port 5000 is available..." -ForegroundColor Cyan
$portInUse = netstat -ano | findstr ":5000" | findstr "LISTENING"
if ($portInUse) {
    Write-Host "[WARN] Port 5000 is already in use. Attempting to free it..." -ForegroundColor Yellow
    $processId = ($portInUse -split '\s+')[-1]
    if ($processId) {
        try {
            taskkill /PID $processId /F 2>&1 | Out-Null
            Write-Host "[OK] Port 5000 is now free" -ForegroundColor Green
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "[ERROR] Could not free port 5000. Please stop the process manually." -ForegroundColor Red
            Write-Host "   Process ID: $processId" -ForegroundColor Yellow
            exit 1
        }
    }
} else {
    Write-Host "[OK] Port 5000 is available" -ForegroundColor Green
}

# Navigate back to backend directory
Set-Location $PSScriptRoot

# Apply a SAFE allowlist of idempotent migrations needed at runtime.
# (Some older migrations are not safe to re-run on every start.)
Write-Host "[INFO] Applying required migrations (if any)..." -ForegroundColor Cyan
$migrationsPath = Join-Path $PSScriptRoot "database\migrations"

if (Test-Path $migrationsPath) {
    $requiredMigrations = @(
        "add_milk_price_settings.sql",
        "bootstrap_salary_payroll_tables.sql",
        "add_farmer_free_products_issue_tracking.sql",
        "fix_farmer_free_products_issue_tracking_backfill.sql",
        "add_payment_free_items.sql",
        "add_worker_free_products_issue_tracking.sql",
        "add_reporting_views.sql",
        "add_sale_items_free_quantity.sql",
        "add_sales_reverse_and_edit_tracking.sql"
    )

    foreach ($mig in $requiredMigrations) {
        $filePath = Join-Path $migrationsPath $mig
        if (Test-Path $filePath) {
            Write-Host "   [MIGRATE] $mig" -ForegroundColor Gray
            $sql = Get-Content -Raw $filePath
            $sql | docker exec -i yogurt-postgres psql -U postgres -d yogurt_erp | Out-Null
        } else {
            Write-Host "[WARN] Missing migration file: $mig" -ForegroundColor Yellow
        }
    }

    Write-Host "[OK] Required migrations applied (or already present)" -ForegroundColor Green
} else {
    Write-Host "[WARN] Migrations folder not found: $migrationsPath" -ForegroundColor Yellow
}

# Check if database needs seeding (optional - user can run manually)
Write-Host "[INFO] Checking if database needs seeding..." -ForegroundColor Cyan
Write-Host "[INFO] If login fails, run: npm run seed" -ForegroundColor Yellow

# Start the server
Write-Host "[INFO] Starting backend server..." -ForegroundColor Cyan
npm start
