import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { getAWSClientConfig } from '../config/aws.js'
import { logger } from './logger.js'
import { getRequestId } from './request-context.js'

let snsClient: SNSClient | null = null

function getSNSClient(): SNSClient {
  if (!snsClient) {
    snsClient = new SNSClient(getAWSClientConfig())
  }
  return snsClient
}

export interface PublishMessageOptions {
  topicArn: string
  message: unknown
  messageAttributes?: Record<string, { DataType: string; StringValue: string }>
  subject?: string
}

export async function publishMessage(options: PublishMessageOptions): Promise<string> {
  const { topicArn, message, messageAttributes, subject } = options

  const messageString = typeof message === 'string' ? message : JSON.stringify(message)

  const command = new PublishCommand({
    TopicArn: topicArn,
    Message: messageString,
    Subject: subject,
    MessageAttributes: {
      ...messageAttributes,
      requestId: {
        DataType: 'String',
        StringValue: getRequestId(),
      },
    },
  })

  const response = await getSNSClient().send(command)

  logger.debug(
    { topicArn, messageId: response.MessageId },
    'Published message to SNS'
  )

  return response.MessageId!
}

/**
 * Generic domain event structure
 * Each service should define their own event types
 */
export interface DomainEvent<T = unknown> {
  eventType: string
  payload: T
  timestamp: string
  requestId: string
}

/**
 * EXAMPLE: Event types enum for type safety
 * Each service should define their own event types following this pattern
 *
 * @example
 * ```typescript
 * // In your service module
 * export const BillingEvents = {
 *   INVOICE_CREATED: 'billing.invoice.created',
 *   PAYMENT_RECEIVED: 'billing.payment.received',
 * } as const
 *
 * export type BillingEventType = (typeof BillingEvents)[keyof typeof BillingEvents]
 * ```
 */
export const ExampleEventTypes = {
  ENTITY_CREATED: 'example.entity.created',
  ENTITY_UPDATED: 'example.entity.updated',
  ENTITY_DELETED: 'example.entity.deleted',
} as const

export type ExampleEventType = (typeof ExampleEventTypes)[keyof typeof ExampleEventTypes]

/**
 * Generic event publishing function
 * Use this to publish domain events to SNS topics
 *
 * @param topicArn - SNS topic ARN to publish to
 * @param eventType - Event type identifier (use your service's event type enum)
 * @param payload - Event payload data
 * @returns Message ID or null if topic not configured
 *
 * @example
 * ```typescript
 * await publishEvent(
 *   env.SNS_TOPIC_ARN_BILLING,
 *   BillingEvents.INVOICE_CREATED,
 *   { invoiceId: invoice.id, amount: invoice.amount }
 * )
 * ```
 */
export async function publishEvent<T = unknown>(
  topicArn: string | undefined,
  eventType: string,
  payload: T
): Promise<string | null> {
  if (!topicArn) {
    logger.warn({ eventType }, 'SNS topic ARN not configured, skipping publish')
    return null
  }

  const event: DomainEvent<T> = {
    eventType,
    payload,
    timestamp: new Date().toISOString(),
    requestId: getRequestId(),
  }

  return publishMessage({
    topicArn,
    message: event,
  })
}
