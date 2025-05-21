import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChatMessage } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";

export function useChat() {
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Fetch chat history
  const { 
    data: messages = [], 
    isLoading, 
    error 
  } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat"],
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/chat", { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
    }
  });

  // Send a message
  const sendMessage = (content: string) => {
    if (content.trim()) {
      sendMessageMutation.mutate(content);
    }
  };

  // Mark first load as complete after initial data fetch
  useEffect(() => {
    if (!isLoading && isFirstLoad) {
      setIsFirstLoad(false);
    }
  }, [isLoading, isFirstLoad]);

  return {
    messages,
    isLoading: isLoading || isFirstLoad,
    isError: !!error,
    sendMessage,
    isSending: sendMessageMutation.isPending
  };
}
