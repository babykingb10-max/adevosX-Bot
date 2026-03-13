require('dotenv').config();

module.exports = {
    SESSION_ID: global.SESSION_ID || process.env.SESSION_ID,
    WARN_COUNT: 3
};
