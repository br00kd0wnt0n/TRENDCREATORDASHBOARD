// Dashboard Integration for RalphLovesTrends
// This file enables communication with the unified dashboard

(function() {
    // Check if we're in an iframe
    if (window.self !== window.top) {
        console.log('RalphLovesTrends: Running in iframe, enabling dashboard integration');

        // Function to send selected trend to parent
        function sendTrendSelection(trendData) {
            window.parent.postMessage({
                type: 'trend-selected',
                source: 'ralph-loves-trends',
                data: trendData
            }, '*');
        }

        // Add click handlers to trend cards
        function attachTrendSelectors() {
            // For existing trend cards
            document.addEventListener('click', function(e) {
                const trendCard = e.target.closest('.trend-card, .trend-item, [data-trend-id]');
                if (trendCard) {
                    // Extract trend data from the card
                    const trendData = {
                        id: trendCard.dataset.trendId || null,
                        hashtag: trendCard.querySelector('.hashtag, .trend-hashtag, h3')?.textContent ||
                                trendCard.textContent.match(/#\w+/)?.[0] || null,
                        platform: trendCard.querySelector('.platform, .trend-platform')?.textContent || null,
                        category: trendCard.querySelector('.category, .trend-category')?.textContent || null,
                        sentiment: trendCard.dataset.sentiment || null,
                        confidence: trendCard.dataset.confidence || null,
                        aiInsights: trendCard.querySelector('.ai-insights, .trend-insights')?.textContent || null,
                        // Include full element for fallback parsing
                        rawElement: trendCard.outerHTML
                    };

                    console.log('Trend selected:', trendData);
                    sendTrendSelection(trendData);

                    // Visual feedback
                    document.querySelectorAll('.trend-card, .trend-item').forEach(card => {
                        card.style.border = '';
                        card.style.boxShadow = '';
                    });
                    trendCard.style.border = '3px solid #EB008B';
                    trendCard.style.boxShadow = '0 4px 20px rgba(235, 0, 139, 0.3)';
                }
            });
        }

        // For API-based trend selection (if using programmatic selection)
        window.selectTrendForCrossover = function(trendData) {
            sendTrendSelection(trendData);
        };

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attachTrendSelectors);
        } else {
            attachTrendSelectors();
        }

        // Send initial ready message
        window.parent.postMessage({
            type: 'trends-tool-ready',
            source: 'ralph-loves-trends'
        }, '*');
    }
})();