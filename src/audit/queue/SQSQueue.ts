import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'
import { getAWSClientConfig } from '../../config/aws.js'
import type { IQueue, QueueMessage, ReceiveOptions } from './IQueue.js'

let sqsClient: SQSClient | null = null

function getSQSClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient(getAWSClientConfig())
  }
  return sqsClient
}

export class SQSQueue implements IQueue {
  async publish(queueUrl: string, message: unknown): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    })
    await getSQSClient().send(command)
  }

  async receiveMessages(queueUrl: string, options: ReceiveOptions): Promise<QueueMessage[]> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: options.maxMessages,
      WaitTimeSeconds: options.waitTimeSeconds,
    })

    const response = await getSQSClient().send(command)

    if (!response.Messages) return []

    return response.Messages.map((msg) => ({
      body: msg.Body ?? '',
      receiptHandle: msg.ReceiptHandle ?? '',
      messageId: msg.MessageId ?? '',
    }))
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
    await getSQSClient().send(command)
  }
}
