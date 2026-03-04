export interface QueueMessage {
  body: string
  receiptHandle: string
  messageId: string
}

export interface ReceiveOptions {
  maxMessages: number
  waitTimeSeconds: number
}

export interface IQueue {
  publish(queueUrl: string, message: unknown): Promise<void>
  receiveMessages(queueUrl: string, options: ReceiveOptions): Promise<QueueMessage[]>
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>
}
