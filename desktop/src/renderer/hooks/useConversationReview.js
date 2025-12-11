
import { useState, useEffect, useCallback } from 'react';

export function useConversationReview(conversationId) {
    const [review, setReview] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchReview = useCallback(async () => {
        if (!conversationId) {
            setReview(null);
            return;
        }

        try {
            setIsLoading(true);
            const result = await window.electronAPI.getConversationReview(conversationId);
            if (result.success && result.data) {
                setReview(result.data.review_data);
            } else {
                // 当没有复盘时清空旧数据，避免显示上一个对话的内容
                setReview(null);
            }
        } catch (err) {
            console.error('Failed to fetch review:', err);
            setReview(null);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [conversationId]);

    const generate = useCallback(async () => {
        if (!conversationId) return;

        setIsLoading(true);
        setError(null);
        try {
            const result = await window.electronAPI.generateConversationReview(conversationId, { force: true });
            if (result.success) {
                setReview(result.data);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [conversationId]);

    useEffect(() => {
        fetchReview();
    }, [fetchReview]);

    return { review, isLoading, error, generate };
}
