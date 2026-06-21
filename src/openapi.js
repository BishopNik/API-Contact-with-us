import { projects } from './projects.js';

const successSchema = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean', const: true } },
};

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    fields: { type: 'object', additionalProperties: { type: 'string' } },
  },
};

export function buildInstructions(baseUrl) {
  return {
    name: 'Multi-site Contact API',
    documentation: `${baseUrl}/docs`,
    openapi: `${baseUrl}/openapi.json`,
    health: `${baseUrl}/health`,
    contentType: 'application/json',
    method: 'POST',
    projects: Object.entries(projects).map(([key, project]) => ({
      project: key,
      title: project.title,
      endpoint: `${baseUrl}/api/contact/${key}`,
      requiredFields: fieldNames(project, rule => rule.required),
      optionalFields: fieldNames(project, rule => !rule.required),
      honeypotFields: project.honeypots,
    })),
  };
}

export function buildOpenApi(baseUrl) {
  const paths = {
    '/': { get: operation('Краткая информация об API', 'Возвращает ссылки на документацию.') },
    '/api/instructions': { get: operation('Инструкция для форм', 'Возвращает endpoints и поля всех проектов.') },
    '/health': { get: operation('Проверка состояния', 'Показывает доступность API и наличие Telegram-конфигурации.') },
  };
  const schemas = { Success: successSchema, Error: errorSchema };

  for (const [key, project] of Object.entries(projects)) {
    const schemaName = `${pascalCase(key)}Submission`;
    schemas[schemaName] = projectSchema(project);
    paths[`/api/contact/${key}`] = {
      post: {
        tags: ['Contact forms'],
        summary: `Отправить заявку — ${project.title}`,
        operationId: `submit${pascalCase(key)}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${schemaName}` },
              example: projectExample(project),
            },
          },
        },
        responses: {
          200: response('Заявка доставлена или отклонена honeypot-фильтром', 'Success'),
          400: response('Ошибка валидации или JSON', 'Error'),
          403: response('Origin сайта не разрешён', 'Error'),
          413: response('Слишком большой запрос', 'Error'),
          429: response('Превышен лимит запросов', 'Error'),
          502: response('Telegram временно недоступен', 'Error'),
          503: response('Telegram не настроен', 'Error'),
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Multi-site Contact API',
      version: '1.1.0',
      description: 'Принимает заявки с A-House, Clean Space, LED Flex и Laser Clean и отправляет их в Telegram.',
    },
    servers: [{ url: baseUrl }],
    tags: [{ name: 'Information' }, { name: 'Contact forms' }],
    paths,
    components: { schemas },
  };
}

export function swaggerHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Contact API — Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body{margin:0;background:#fafafa}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui',deepLinking:true,tryItOutEnabled:true});</script>
</body>
</html>`;
}

function projectSchema(project) {
  const properties = {};
  const required = [];
  for (const [name, rule] of Object.entries(project.fields)) {
    properties[name] = {
      type: 'string', title: rule.label,
      ...(rule.min ? { minLength: rule.min } : {}),
      ...(rule.max ? { maxLength: rule.max } : {}),
      ...(rule.format ? { format: rule.format } : {}),
    };
    if (rule.required) required.push(name);
  }
  for (const name of project.honeypots) {
    properties[name] = { type: 'string', maxLength: 200, description: 'Honeypot: нормальный пользователь оставляет поле пустым.' };
  }
  return { type: 'object', additionalProperties: false, properties, required };
}

function projectExample(project) {
  const examples = {
    name: 'Anna Kowalska', contact: '+48 700 000 000', email: 'anna@example.com',
    phone: '+48 700 000 000', service: 'Office', country: 'Polska', project: 'family',
    message: 'Proszę o kontakt w sprawie wyceny.', lang: 'pl', language: 'pl',
  };
  return Object.fromEntries(Object.keys(project.fields).map(name => [name, examples[name] || 'Example']));
}

function fieldNames(project, predicate) {
  return Object.entries(project.fields).filter(([, rule]) => predicate(rule)).map(([name]) => name);
}

function operation(summary, description) {
  return { tags: ['Information'], summary, description, responses: { 200: { description: 'OK' } } };
}

function response(description, schema) {
  return { description, content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } } };
}

function pascalCase(value) {
  return value.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
}
