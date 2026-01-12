module.exports = {
    apps: [
        {
            name: 'api-server',
            script: './dist/api/server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'scraper-worker',
            script: './dist/workers/scraper.worker.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'rating-worker',
            script: './dist/workers/rating.worker.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'crm-worker',
            script: './dist/workers/crm.worker.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
