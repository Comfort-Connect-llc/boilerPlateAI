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
- Uses `.env` file (convenience)
- SSM not loaded when `NODE_ENV=local` or `NODE_ENV=test`

### Production/Staging/Dev
- Automatically loads from SSM on startup
- Merges SSM + environment variables (env vars override)
- No `.env` file needed

### Parameter Paths

The application loads parameters from these paths in order (later overrides earlier):

1. `/shared/{environment}/` - Shared across all services
2. `/{service-name}/{environment}/` - Service-specific

Example for `SERVICE_NAME=my-service` in `production`:
```
/shared/production/
  ├── AWS_REGION
  ├── LOG_LEVEL
  └── ...

/my-service/production/
  ├── DATABASE_URL
  ├── AUTH0_CLIENT_SECRET
  ├── STRIPE_SECRET_KEY
  └── ...
```

## Setup Instructions

### 1. Using AWS Console

1. Go to **AWS Systems Manager → Parameter Store**
2. Click **Create parameter**

**For shared parameters:**
- Name: `/shared/production/LOG_LEVEL`
- Type: `String`
- Value: `info`

**For secrets:**
- Name: `/my-service/production/AUTH0_CLIENT_SECRET`
- Type: `SecureString` (encrypted with KMS)
- Value: `your-secret-value`

**For service-specific config:**
- Name: `/my-service/production/DATABASE_URL`
- Type: `SecureString`
- Value: `postgresql://user:password@host:5432/db`

### 2. Using AWS CLI

```bash
# Shared parameter (String)
aws ssm put-parameter \
  --name "/shared/production/AWS_REGION" \
  --value "us-east-1" \
  --type "String" \
  --description "AWS region for all services"

# Service secret (SecureString - encrypted)
aws ssm put-parameter \
  --name "/my-service/production/AUTH0_CLIENT_SECRET" \
  --value "your-secret-value" \
  --type "SecureString" \
  --description "Auth0 client secret for my-service"

# Database URL
aws ssm put-parameter \
  --name "/my-service/production/DATABASE_URL" \
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

# Shared parameters
resource "aws_ssm_parameter" "shared_aws_region" {
  name  = "/shared/${var.environment}/AWS_REGION"
  type  = "String"
  value = var.aws_region
}

resource "aws_ssm_parameter" "shared_log_level" {
  name  = "/shared/${var.environment}/LOG_LEVEL"
  type  = "String"
  value = var.environment == "production" ? "info" : "debug"
}

# Service-specific parameters
resource "aws_ssm_parameter" "database_url" {
  name  = "/${var.service_name}/${var.environment}/DATABASE_URL"
  type  = "SecureString"
  value = "postgresql://${var.db_user}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
}

resource "aws_ssm_parameter" "auth0_secret" {
  name  = "/${var.service_name}/${var.environment}/AUTH0_CLIENT_SECRET"
  type  = "SecureString"
  value = var.auth0_client_secret
}

resource "aws_ssm_parameter" "s3_bucket" {
  name  = "/${var.service_name}/${var.environment}/S3_BUCKET_NAME"
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
        "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/my-service/*",
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
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/${ServiceName}/${Environment}/*",
        "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/shared/${Environment}/*"
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

Use UPPERCASE with underscores for parameter keys:

```
✅ Good:
/my-service/production/DATABASE_URL
/my-service/production/AUTH0_CLIENT_SECRET
/shared/production/LOG_LEVEL

❌ Bad:
/my-service/production/database-url
/my-service/production/auth0ClientSecret
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
  --path "/my-service/production/" \
  --recursive

# List shared parameters
aws ssm get-parameters-by-path \
  --path "/shared/production/" \
  --recursive
```

### 2. Test in Development Environment

```bash
# Set environment to dev (not local)
export NODE_ENV=development
export SERVICE_NAME=my-service

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
  --name "/my-service/production/AUTH0_CLIENT_SECRET" \
  --with-decryption
```

## Deployment Workflow

### Development/Staging/Production

1. **Set environment variables:**
   ```bash
   NODE_ENV=production
   SERVICE_NAME=my-service
   AWS_REGION=us-east-1
   ```

2. **Application auto-loads from SSM:**
   - Fetches from `/shared/production/`
   - Fetches from `/my-service/production/`
   - Merges with environment variables
   - Starts server

3. **No `.env` file needed!**

### Secret Rotation

1. Update parameter in SSM:
   ```bash
   aws ssm put-parameter \
     --name "/my-service/production/DATABASE_PASSWORD" \
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
aws ssm get-parameters-by-path --path "/shared/production/"
```

### Parameters not found

**Error:** `"Failed to load from SSM path (may not exist)"`

**Solution:**
- This is a warning, not an error
- Paths may not exist (e.g., `/shared/local/`)
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
# 1. Create shared parameters (once per environment)
aws ssm put-parameter --name "/shared/production/AWS_REGION" --value "us-east-1" --type "String"
aws ssm put-parameter --name "/shared/production/LOG_LEVEL" --value "info" --type "String"

# 2. Create service-specific parameters
SERVICE=my-service
ENV=production

aws ssm put-parameter --name "/$SERVICE/$ENV/AUTH0_DOMAIN" --value "tenant.auth0.com" --type "String"
aws ssm put-parameter --name "/$SERVICE/$ENV/AUTH0_AUDIENCE" --value "https://api.example.com" --type "String"
aws ssm put-parameter --name "/$SERVICE/$ENV/AUTH0_CLIENT_ID" --value "xxx" --type "String"
aws ssm put-parameter --name "/$SERVICE/$ENV/AUTH0_CLIENT_SECRET" --value "xxx" --type "SecureString"
aws ssm put-parameter --name "/$SERVICE/$ENV/AUTH0_ISSUER_BASE_URL" --value "https://tenant.auth0.com" --type "String"
aws ssm put-parameter --name "/$SERVICE/$ENV/DATABASE_URL" --value "postgresql://..." --type "SecureString"
aws ssm put-parameter --name "/$SERVICE/$ENV/DYNAMODB_TABLE_PREFIX" --value "$SERVICE" --type "String"
aws ssm put-parameter --name "/$SERVICE/$ENV/S3_BUCKET_NAME" --value "$SERVICE-$ENV-bucket" --type "String"

# 3. Deploy with environment variables
export NODE_ENV=$ENV
export SERVICE_NAME=$SERVICE

# 4. Start application - config loads automatically!
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
   # For each line in .env, create an SSM parameter
   KEY=VALUE → aws ssm put-parameter --name "/service/env/KEY" --value "VALUE" --type "SecureString"
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
