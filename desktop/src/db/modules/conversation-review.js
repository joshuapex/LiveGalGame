export default function ConversationReviewManager(BaseClass) {
    return class extends BaseClass {
        // 保存复盘报告
        saveConversationReview(data) {
            if (!data.conversation_id || !data.review_data) {
                throw new Error('Missing required fields: conversation_id or review_data');
            }

            const stmt = this.db.prepare(`
        INSERT INTO conversation_reviews (id, conversation_id, review_data, created_at, model_used)
        VALUES (@id, @conversation_id, @review_data, @created_at, @model_used)
        ON CONFLICT(id) DO UPDATE SET
          review_data = excluded.review_data,
          created_at = excluded.created_at,
          model_used = excluded.model_used
      `);

            const reviewId = data.id || `review-${Date.now()}`;
            const info = stmt.run({
                id: reviewId,
                conversation_id: data.conversation_id,
                review_data: typeof data.review_data === 'string' ? data.review_data : JSON.stringify(data.review_data),
                created_at: data.created_at || Date.now(),
                model_used: data.model_used || null
            });

            return reviewId;
        }

        // 获取复盘报告
        getConversationReview(conversationId) {
            const stmt = this.db.prepare(`
        SELECT * FROM conversation_reviews
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);

            const result = stmt.get(conversationId);
            if (!result) return null;

            try {
                return {
                    ...result,
                    review_data: JSON.parse(result.review_data)
                };
            } catch (e) {
                console.error('Failed to parse review data:', e);
                return {
                    ...result,
                    review_data: null
                };
            }
        }
    };
}
