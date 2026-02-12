import { logger } from '../utils/logger';

export interface PostbackRequest {
  postbackUrl: string;
  payload: Record<string, unknown>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
}

interface QueuedPostback extends PostbackRequest {
  id: string;
  createdAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retries: number;
}

class QueueService {
  private queue: Map<string, QueuedPostback> = new Map();
  private processing: Set<string> = new Set();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  /**
   * Add a postback request to the queue
   */
  async enqueue(request: PostbackRequest): Promise<string> {
    const id = this.generateId();
    const queued: QueuedPostback = {
      ...request,
      id,
      createdAt: new Date(),
      status: 'pending',
      retries: 0,
    };

    this.queue.set(id, queued);
    logger.info('Postback queued', { id, postbackUrl: request.postbackUrl });

    // Process asynchronously without blocking
    setImmediate(() => this.processQueue());

    return id;
  }

  /**
   * Process the queue asynchronously
   */
  private async processQueue(): Promise<void> {
    const pending = Array.from(this.queue.values()).filter(
      (item) => item.status === 'pending' && !this.processing.has(item.id)
    );

    if (pending.length === 0) {
      return;
    }

    // Process items concurrently (with limit for scalability)
    const concurrentLimit = 10;
    const toProcess = pending.slice(0, concurrentLimit);

    await Promise.allSettled(
      toProcess.map((item) => this.processPostback(item))
    );

    // Continue processing if there are more items
    if (pending.length > concurrentLimit) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Process a single postback
   */
  private async processPostback(item: QueuedPostback): Promise<void> {
    this.processing.add(item.id);
    item.status = 'processing';

    try {
      await this.executePostback(item);
      item.status = 'completed';
      logger.info('Postback completed', { id: item.id });
    } catch (error) {
      item.retries += 1;

      if (item.retries < this.MAX_RETRIES) {
        item.status = 'pending';
        logger.warn('Postback failed, will retry', {
          id: item.id,
          retries: item.retries,
          error: error instanceof Error ? error.message : String(error),
        });

        // Retry after delay
        setTimeout(() => {
          this.processing.delete(item.id);
          setImmediate(() => this.processQueue());
        }, this.RETRY_DELAY * item.retries);
      } else {
        item.status = 'failed';
        logger.error('Postback failed after max retries', {
          id: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.processing.delete(item.id);
    }
  }

  /**
   * Execute the actual HTTP postback
   */
  private async executePostback(item: QueuedPostback): Promise<void> {
    const method = item.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'QueueSocketProvider/1.0',
      ...item.headers,
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    if (method !== 'GET' && Object.keys(item.payload).length > 0) {
      options.body = JSON.stringify(item.payload);
    }

    const response = await fetch(item.postbackUrl, options);

    if (!response.ok) {
      throw new Error(
        `Postback failed with status ${response.status}: ${response.statusText}`
      );
    }
  }

  /**
   * Get queue status
   */
  getStatus(id: string): QueuedPostback | undefined {
    return this.queue.get(id);
  }

  /**
   * Get all queue items (for monitoring)
   */
  getAllItems(): QueuedPostback[] {
    return Array.from(this.queue.values());
  }

  /**
   * Clean up completed/failed items older than specified time
   */
  cleanup(olderThanMs: number = 3600000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.queue.forEach((item, id) => {
      if (
        (item.status === 'completed' || item.status === 'failed') &&
        now - item.createdAt.getTime() > olderThanMs
      ) {
        toDelete.push(id);
      }
    });

    toDelete.forEach((id) => this.queue.delete(id));

    if (toDelete.length > 0) {
      logger.info('Cleaned up queue items', { count: toDelete.length });
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

export const queueService = new QueueService();

// Cleanup old items every hour
setInterval(() => {
  queueService.cleanup(3600000); // 1 hour
}, 3600000);
