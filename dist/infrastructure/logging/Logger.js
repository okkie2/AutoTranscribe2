export function shouldLog(currentLevel, messageLevel) {
    const order = ["debug", "info", "warn", "error"];
    return order.indexOf(messageLevel) >= order.indexOf(currentLevel);
}
