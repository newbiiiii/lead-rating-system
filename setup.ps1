# 创建 .env 文件
Write-Output "创建 .env 文件..."
Copy-Item .env.example .env

# 生成随机密码
$postgresPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object{[char]$_})

# 替换密码
(Get-Content .env) -replace 'your_postgres_password', $postgresPassword | Set-Content .env

Write-Output "✓ .env 文件已创建"
Write-Output "PostgreSQL 密码已设置为: $postgresPassword"
Write-Output ""
Write-Output "请编辑 .env 文件，添加以下必需的 API Key:"
Write-Output "  - OPENAI_API_KEY"
Write-Output "  - HUBSPOT_API_KEY (可选)"
Write-Output "  - WECHAT_WEBHOOK_URL (可选)"
