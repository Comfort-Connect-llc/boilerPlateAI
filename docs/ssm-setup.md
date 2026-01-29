# SSM Parameter Store Setup Guide

This guide shows how to set up AWS Systems Manager (SSM) Parameter Store for secure configuration management.

## Why SSM Parameter Store?

**Security Benefits:**
- ✅ Encrypted at rest with KMS
- ✅ Encrypted in transit (TLS)
- ✅ IAM-based access control
- ✅ CloudTrail audit logs (who accessed what and when)
- ✅ No `.env` files to leak or commit

**Operational Benefits:**
- ✅ Centralized secret management
- ✅ Version history
- ✅ Easy rotation (update once, applies everywhere)
- ✅ Environment-specific automatic (path-based)

## How It Works

### Local Development
- Uses `.env` file (via `dotenv`) and/or environment variables
- Bootstrap still attempts SSM; on failure (e.g. no AWS credentials or paths missing), falls back to env only
- In tests, use `loadEnv()` to bypass SSM and load only from `process.env`

### Production/Staging
- On startup, `bootstrap()` loads from SSM then merges with environment variables (env overrides SSM)
- No `.env` file needed; optional dynamic flags under `/api/{serviceName}/flags/` are fetched on-demand via `config.get()`

### Parameter Paths

The application loads parameters from these paths in order (later overrides earlier):

1. `/shared/common/` - Shared across all services
2. `/api/{serviceName}/` - Service-specific
3. Custom paths (if configured)

Parameters under `/api/{serviceName}/flags/` are **dynamic flags**: they are not loaded at bootstrap. Use `config.get(flagName)` at runtime to fetch them on-demand.

Example for `SERVICE_NAME=boilerplate`:
```
/shared/common/
  ├── AWS_REGION
  ├── LOG_LEVEL
  └── ...

/api/boilerplate/
  ├── DATABASE_URL
  ├── AUTH0_CLIENT_SECRET
  ├── STRIPE_SECRET_KEY
  └── ...

/api/boilerplate/flags/
  ├── FEATURE_X_ENABLED
  └── FEATURE_Y_ENABLED
```

## Setup Instructions

### 1. Using AWS Console

1. Go to **AWS Systems Manager → Parameter Store**
2. Click **Create parameter**

**For shared parameters:**
- Name: `/shared/common/LOG_LEVEL`
- Type: `String`
- Value: `info`

**For secrets:**
- Name: `/api/boilerplate/AUTH0_CLIENT_SECRET`
- Type: `SecureString` (encrypted with KMS)
- Value: `your-secret-value`

**For service-specific config:**
- Name: `/api/boilerplate/DATABASE_URL`
- Type: `SecureString`
- Value: `postgresql://user:password@host:5432/db`

**For dynamic flags (fetched on-demand):**
- Name: `/api/boilerplate/flags/FEATURE_X_ENABLED`
- Type: `String`
- Value: `true` or `false`

### 2. Using AWS CLI

```bash
# Shared parameter (String)
aws ssm put-parameter \
  --name "/shared/common/AWS_REGION" \
  --value "us-east-1" \
  --type "String" \
  --description "AWS region for all services"

# Service secret (SecureString - encrypted)
aws ssm put-parameter \
  --name "/api/boilerplate/AUTH0_CLIENT_SECRET" \
  --value "your-secret-value" \
  --type "SecureString" \
  --description "Auth0 client secret"

# Database URL
aws ssm put-parameter \
  --name "/api/boilerplate/DATABASE_URL" \
  --value "postgresql://user:password@prod-db.rds.amazonaws.com:5432/mydb" \
  --type "SecureString"
```

### 3. Using Terraform (Recommended)

```hcl
# terraform/ssm-parameters.tf

variable "service_name" {
  default = "my-service"
}

variable "environment" {
  default = "production"
}

# Shared parameters (path: /shared/common/)
resource "aws_ssm_parameter" "shared_aws_region" {
  name  = "/shared/common/AWS_REGION"
  type  = "String"
  value = var.aws_region
}

resource "aws_ssm_parameter" "shared_log_level" {
  name  = "/shared/common/LOG_LEVEL"
  type  = "String"
  value = var.environment == "production" ? "info" : "debug"
}

# Service-specific parameters (path: /api/{service_name}/)
resource "aws_ssm_parameter" "database_url" {
  name  = "/api/${var.service_name}/DATABASE_URL"
  type  = "SecureString"
  value = "postgresql://${var.db_user}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
}

resource "aws_ssm_parameter" "auth0_secret" {
  name  = "/api/${var.service_name}/AUTH0_CLIENT_SECRET"
  type  = "SecureString"
  value = var.auth0_client_secret
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "/api/${var.service_name}/S3_BUCKET_NAME"
  type  = "String"
  value = aws_s3_bucket.main.id
}
```

## Required IAM Permissions

Your application needs these IAM permissions to read from SSM:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath",
        "ssm:GetParameter"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/api/*",
        "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/shared/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

### For ECS Tasks

Attach this policy to your ECS Task Role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:GetParametersByPath",
      "Resource": [
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/api/${ServiceName}/*",
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/shared/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "ssm.${AWS::Region}.amazonaws.com"
        }
      }
    }
  ]
}
```

## Parameter Naming Convention

Use UPPERCASE with underscores for parameter keys. Paths use `/api/{serviceName}/` and `/shared/common/`:

```
✅ Good:
/api/boilerplate/DATABASE_URL
/api/boilerplate/AUTH0_CLIENT_SECRET
/api/boilerplate/flags/FEATURE_X_ENABLED
/shared/common/LOG_LEVEL

❌ Bad:
/api/boilerplate/database-url
/api/boilerplate/auth0ClientSecret
```

## Parameter Types

### String
- Use for non-sensitive config
- Plaintext storage
- Example: `LOG_LEVEL`, `AWS_REGION`, `PORT`

### SecureString
- Use for secrets and sensitive data
- Encrypted with KMS
- Example: `DATABASE_URL`, `AUTH0_CLIENT_SECRET`, `API_KEYS`

### StringList
- Not commonly used in this boilerplate
- For comma-separated values
- Example: `INTERNAL_DOMAINS` (though we handle this as String)

## Testing SSM Configuration

### 1. Verify Parameters Exist

```bash
# List all parameters for your service
aws ssm get-parameters-by-path \
  --path "/api/boilerplate/" \
  --recursive

# List shared parameters
aws ssm get-parameters-by-path \
  --path "/shared/common/" \
  --recursive
```

### 2. Test in Development Environment

```bash
# Set environment (SSM is attempted on bootstrap; use local/test to bypass)
export NODE_ENV=development
export SERVICE_NAME=boilerplate

# Run the application
npm start

# Check logs for:
# "Loading configuration from SSM Parameter Store"
# "Loaded parameters from SSM path"
# "Configuration bootstrapped successfully"
```

### 3. Verify Access

```bash
# Test reading a secure parameter
aws ssm get-parameter \
  --name "/api/boilerplate/AUTH0_CLIENT_SECRET" \
  --with-decryption
```

## Deployment Workflow

### Development/Staging/Production

1. **Set environment variables:**
   ```bash
   NODE_ENV=production
   SERVICE_NAME=boilerplate
   AWS_REGION=us-east-1
   ```

2. **Application auto-loads from SSM on bootstrap:**
   - Fetches from `/shared/common/`
   - Fetches from `/api/boilerplate/` (and custom paths if configured)
   - Dynamic flags under `/api/boilerplate/flags/` are fetched on-demand via `config.get()`
   - Merges with environment variables (env overrides SSM)
   - Starts server

3. **No `.env` file needed!**

### Secret Rotation

1. Update parameter in SSM:
   ```bash
  aws ssm put-parameter \
    --name "/api/boilerplate/DATABASE_PASSWORD" \
    --value "new-password" \
    --type "SecureString" \
    --overwrite
   ```

2. Restart application (ECS, Lambda, etc.)

3. New secret applied automatically!

## Troubleshooting

### Application fails to load config

**Check:**
- IAM permissions are correct
- Parameters exist at correct paths
- SERVICE_NAME and NODE_ENV are set
- AWS credentials are available

**Debug:**
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Check SSM access
aws ssm get-parameters-by-path --path "/shared/common/"
```

### Parameters not found

**Error:** `"Failed to load from SSM path (may not exist)"`

**Solution:**
- This is a warning, not an error
- Paths may not exist (e.g., `/shared/common/` or `/api/boilerplate/` empty)
- Application falls back to environment variables

### KMS decryption errors

**Error:** `"AccessDeniedException"`

**Solution:**
- Add KMS decrypt permission to IAM role
- Ensure KMS key policy allows the role

## Cost Considerations

SSM Parameter Store pricing:

- **Standard parameters:** FREE (up to 10,000)
- **Advanced parameters:** $0.05 per parameter per month
- **API calls:** $0.05 per 10,000 GetParametersByPath requests

**Typical costs:** < $1/month for most applications

Compare to managing `.env` files in S3:
- S3 storage costs
- S3 API request costs
- Security risk of plaintext secrets
- Manual rotation workflow

**SSM is cheaper and more secure!**

## Best Practices

1. **Use SecureString for all secrets**
2. **Organize by environment and service**
3. **Document parameters in Terraform**
4. **Never commit `.env` to git**
5. **Use IAM policies to restrict access**
6. **Enable CloudTrail for audit logs**
7. **Rotate secrets regularly**
8. **Test in non-production first**

## Example: Complete Setup for New Service

```bash
# 1. Create shared parameters (once)
aws ssm put-parameter --name "/shared/common/AWS_REGION" --value "us-east-1" --type "String"
aws ssm put-parameter --name "/shared/common/LOG_LEVEL" --value "info" --type "String"

# 2. Create service-specific parameters
SERVICE=boilerplate

aws ssm put-parameter --name "/api/$SERVICE/AUTH0_DOMAIN" --value "tenant.auth0.com" --type "String"
aws ssm put-parameter --name "/api/$SERVICE/AUTH0_AUDIENCE" --value "https://api.example.com" --type "String"
aws ssm put-parameter --name "/api/$SERVICE/AUTH0_CLIENT_ID" --value "xxx" --type "String"
aws ssm put-parameter --name "/api/$SERVICE/AUTH0_CLIENT_SECRET" --value "xxx" --type "SecureString"
aws ssm put-parameter --name "/api/$SERVICE/AUTH0_ISSUER_BASE_URL" --value "https://tenant.auth0.com" --type "String"
aws ssm put-parameter --name "/api/$SERVICE/DATABASE_URL" --value "postgresql://..." --type "SecureString"
aws ssm put-parameter --name "/api/$SERVICE/DYNAMODB_TABLE_PREFIX" --value "$SERVICE" --type "String"
aws ssm put-parameter --name "/api/$SERVICE/S3_BUCKET_NAME" --value "$SERVICE-bucket" --type "String"

# 3. (Optional) Dynamic flags - fetched on-demand via config.get('FEATURE_X_ENABLED')
aws ssm put-parameter --name "/api/$SERVICE/flags/FEATURE_X_ENABLED" --value "true" --type "String"

# 4. Deploy with environment variables
export NODE_ENV=production
export SERVICE_NAME=$SERVICE

# 5. Start application - config loads automatically!
npm start
```

## Migration from .env Files

If you're currently using `.env` files stored in S3:

1. **Export current .env:**
   ```bash
   cat .env
   ```

2. **Create SSM parameters:**
   ```bash
   # For each line in .env, create an SSM parameter (shared or service path)
   # Shared: /shared/common/KEY | Service: /api/boilerplate/KEY
   aws ssm put-parameter --name "/api/boilerplate/KEY" --value "VALUE" --type "SecureString"
   ```

3. **Test in development:**
   ```bash
   NODE_ENV=development npm start
   ```

4. **Deploy to production:**
   ```bash
   NODE_ENV=production npm start
   ```

5. **Delete .env from S3:**
   ```bash
   aws s3 rm s3://your-bucket/.env.production
   ```

Done! No more insecure .env files.
