/**
 * API Documentation Routes
 * 
 * Provides Swagger/OpenAPI documentation for the API
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// Swagger UI HTML (simplified version)
const swaggerHTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MynetworK API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      background: #050505;
    }
    .swagger-ui {
      background: #050505;
    }
    .swagger-ui .topbar {
      background: #0a0a0a;
      border-bottom: 1px solid #1a1a1a;
    }
    .swagger-ui .info {
      background: #121212;
      color: #e5e7eb;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
        deepLinking: true,
        tryItOutEnabled: true,
        requestInterceptor: (request) => {
          // Add JWT token if available
          const token = localStorage.getItem('token');
          if (token) {
            request.headers['Authorization'] = 'Bearer ' + token;
          }
          return request;
        }
      });
    };
  </script>
</body>
</html>
`;

// GET /api/docs - Swagger UI interface
router.get('/', requireAuth, requireAdmin, (_req, res) => {
  res.send(swaggerHTML);
});

// GET /api/docs/openapi.json - OpenAPI specification
router.get('/openapi.json', requireAuth, requireAdmin, (_req, res) => {
  const openapi = {
    openapi: '3.0.0',
    info: {
      title: 'MynetworK API',
      version: '2.0.0-dev',
      description: 'API documentation for MynetworK - Multi-Source Network Dashboard',
      contact: {
        name: 'MynetworK Support'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3003}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    paths: {
      '/api/metrics/prometheus': {
        get: {
          summary: 'Export Prometheus metrics',
          description: 'Returns metrics in Prometheus format',
          tags: ['Metrics'],
          security: [],
          responses: {
            '200': {
              description: 'Prometheus metrics',
              content: {
                'text/plain': {
                  schema: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      },
      '/api/metrics/influxdb': {
        get: {
          summary: 'Export InfluxDB metrics',
          description: 'Returns metrics in InfluxDB Line Protocol format',
          tags: ['Metrics'],
          responses: {
            '200': {
              description: 'InfluxDB metrics',
              content: {
                'text/plain': {
                  schema: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      },
      '/api/metrics/config': {
        get: {
          summary: 'Get metrics configuration',
          description: 'Returns current metrics export configuration',
          tags: ['Metrics'],
          responses: {
            '200': {
              description: 'Metrics configuration',
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Update metrics configuration',
          description: 'Updates metrics export configuration',
          tags: ['Metrics'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    config: {
                      type: 'object'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Configuration updated'
            }
          }
        }
      },
      '/api/plugins': {
        get: {
          summary: 'Get all plugins',
          description: 'Returns list of all available plugins with their status',
          tags: ['Plugins'],
          responses: {
            '200': {
              description: 'List of plugins'
            }
          }
        }
      },
      '/api/plugins/stats/all': {
        get: {
          summary: 'Get all plugin stats',
          description: 'Returns statistics from all active plugins',
          tags: ['Plugins'],
          responses: {
            '200': {
              description: 'Plugin statistics'
            }
          }
        }
      },
      '/api/config/export': {
        get: {
          summary: 'Export configuration',
          description: 'Exports application configuration to .conf file format',
          tags: ['Configuration'],
          responses: {
            '200': {
              description: 'Configuration file content'
            }
          }
        }
      },
      '/api/config/import': {
        post: {
          summary: 'Import configuration',
          description: 'Imports configuration from .conf file',
          tags: ['Configuration'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: {
                      type: 'string'
                    },
                    filePath: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Configuration imported'
            }
          }
        }
      },
      '/api/users': {
        get: {
          summary: 'Get all users',
          description: 'Returns list of all users (admin only)',
          tags: ['Users'],
          responses: {
            '200': {
              description: 'List of users'
            }
          }
        }
      },
      '/api/users/me': {
        get: {
          summary: 'Get current user',
          description: 'Returns information about the currently authenticated user',
          tags: ['Users'],
          responses: {
            '200': {
              description: 'Current user information'
            }
          }
        }
      },
      '/api/system/server': {
        get: {
          summary: 'Get system server info',
          description: 'Returns system information (CPU, RAM, Disk)',
          tags: ['System'],
          responses: {
            '200': {
              description: 'System information'
            }
          }
        }
      },
      '/api/system/server/network': {
        get: {
          summary: 'Get network stats',
          description: 'Returns network traffic statistics',
          tags: ['System'],
          responses: {
            '200': {
              description: 'Network statistics'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Metrics',
        description: 'Metrics export endpoints (Prometheus, InfluxDB)'
      },
      {
        name: 'Plugins',
        description: 'Plugin management endpoints'
      },
      {
        name: 'Configuration',
        description: 'Configuration export/import endpoints'
      },
      {
        name: 'Users',
        description: 'User management endpoints'
      },
      {
        name: 'System',
        description: 'System information endpoints'
      }
    ]
  };
  
  res.json(openapi);
});

export default router;

