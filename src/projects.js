const text = (label, options = {}) => ({ label, type: 'text', ...options });

export const projects = Object.freeze({
  'a-house': {
    title: 'A-House',
    honeypots: [],
    fields: {
      name: text('Имя', { required: true, min: 2, max: 100 }),
      contact: text('Контакт', { required: true, min: 5, max: 160 }),
      project: text('Проект', { max: 100 }),
      message: text('Пожелания', { max: 2000 }),
    },
  },
  'clean-space': {
    title: 'Clean Space',
    honeypots: ['company'],
    fields: {
      name: text('Имя', { required: true, min: 2, max: 100 }),
      contact: text('Контакт', { required: true, min: 5, max: 160 }),
      service: text('Услуга', { required: true, min: 2, max: 100 }),
      message: text('Детали', { max: 2000 }),
      lang: text('Язык', { max: 10 }),
    },
  },
  'led-flex': {
    title: 'LED Flex',
    honeypots: ['website'],
    fields: {
      name: text('Имя / компания', { required: true, min: 2, max: 100 }),
      email: text('Email', { required: true, format: 'email', max: 160 }),
      phone: text('Телефон', { max: 50 }),
      country: text('Страна монтажа', { max: 100 }),
      message: text('Проект', { required: true, min: 3, max: 2000 }),
      language: text('Язык', { max: 10 }),
    },
  },
  'laser-clean': {
    title: 'Laser Clean',
    honeypots: [],
    fields: {
      name: text('Имя', { required: true, min: 2, max: 100 }),
      phone: text('Телефон', { required: true, min: 5, max: 50 }),
      email: text('Email', { required: true, format: 'email', max: 160 }),
      message: text('Описание', { required: true, min: 3, max: 2000 }),
      language: text('Язык', { max: 10 }),
    },
  },
});

export function validateSubmission(project, body) {
  for (const field of project.honeypots) {
    if (clean(body[field], 200)) return { spam: true };
  }

  const values = {};
  const errors = {};

  for (const [name, rule] of Object.entries(project.fields)) {
    const value = clean(body[name], rule.max);
    values[name] = value;

    if (rule.required && !value) errors[name] = 'required';
    else if (value && rule.min && value.length < rule.min) errors[name] = 'too_short';
    else if (value && rule.format === 'email' && !isEmail(value)) errors[name] = 'invalid_email';
  }

  return Object.keys(errors).length ? { errors } : { values };
}

function clean(value, max = 2000) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
