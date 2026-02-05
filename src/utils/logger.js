const logger = {
    info: (message) => process.env.NODE_ENV !== "production" && console.log(`💡 [INFO]: ${message}`),
    warn: (message) => console.warn(`⚠️ [WARN]: ${message}`),
    error: (message) => console.error(`❌ [ERROR]: ${message}`),
    debug: (message) => process.env.DEBUG_MODE === "true" && console.log(`🔍 [DEBUG]: ${message}`),
};

export default logger;
