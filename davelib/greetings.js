function getTimeGreeting() {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
        return { greeting: 'Good Morning', emoji: '🌅' };
    } else if (hour >= 12 && hour < 17) {
        return { greeting: 'Good Afternoon', emoji: '☀️' };
    } else if (hour >= 17 && hour < 21) {
        return { greeting: 'Good Evening', emoji: '🌆' };
    } else {
        return { greeting: 'Good Night', emoji: '🌙' };
    }
}

function formatTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function formatDate() {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function getGreetingMessage(userName = 'User') {
    const { greeting, emoji } = getTimeGreeting();
    const time = formatTime();
    const date = formatDate();
    
    return `${emoji} *${greeting}, ${userName}!*\n🕐 ${time}\n📅 ${date}`;
}

module.exports = {
    getTimeGreeting,
    formatTime,
    formatDate,
    getGreetingMessage
};
