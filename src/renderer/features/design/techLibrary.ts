/**
 * Curated catalog of common technologies grouped by category. Each entry
 * maps to a simple-icons slug (https://simpleicons.org) so we can render
 * the brand logo via https://cdn.simpleicons.org/<slug>/<color>.
 *
 * Categories drive the block colour and behaviour on the canvas. The user
 * can also add a "blank" block of any category if their tech isn't here.
 */

export type TechCategory = 'frontend' | 'service' | 'database' | 'queue' | 'external' | 'note';

export interface TechEntry {
  /** Stable id, used as the node_type. */
  id: string;
  label: string;
  category: TechCategory;
  /** simple-icons slug. Some categories (note) leave this null. */
  iconSlug: string | null;
  /** Hex without #, used as both border accent and icon tint. */
  color: string;
  /** Optional short tagline shown under the label in the picker. */
  blurb?: string;
}

export const CATEGORY_META: Record<TechCategory, { label: string; color: string }> = {
  frontend: { label: 'Frontend', color: '60a5fa' },
  service:  { label: 'Service',  color: '34d399' },
  database: { label: 'Database', color: 'f59e0b' },
  queue:    { label: 'Queue',    color: 'a78bfa' },
  external: { label: 'External', color: '94a3b8' },
  note:     { label: 'Note',     color: 'facc15' }
};

export const TECH_LIBRARY: TechEntry[] = [
  // --- Frontend ----------------------------------------------------------
  { id: 'react',      label: 'React',      category: 'frontend', iconSlug: 'react',      color: '61dafb' },
  { id: 'nextjs',     label: 'Next.js',    category: 'frontend', iconSlug: 'nextdotjs',  color: 'ffffff' },
  { id: 'remix',      label: 'Remix',      category: 'frontend', iconSlug: 'remix',      color: 'ffffff' },
  { id: 'vue',        label: 'Vue',        category: 'frontend', iconSlug: 'vuedotjs',   color: '4fc08d' },
  { id: 'nuxt',       label: 'Nuxt',       category: 'frontend', iconSlug: 'nuxt',       color: '00dc82' },
  { id: 'svelte',     label: 'Svelte',     category: 'frontend', iconSlug: 'svelte',     color: 'ff3e00' },
  { id: 'sveltekit',  label: 'SvelteKit',  category: 'frontend', iconSlug: 'svelte',     color: 'ff3e00' },
  { id: 'angular',    label: 'Angular',    category: 'frontend', iconSlug: 'angular',    color: 'dd0031' },
  { id: 'solidjs',    label: 'SolidJS',    category: 'frontend', iconSlug: 'solid',      color: '2c4f7c' },
  { id: 'astro',      label: 'Astro',      category: 'frontend', iconSlug: 'astro',      color: 'bc52ee' },
  { id: 'vite',       label: 'Vite',       category: 'frontend', iconSlug: 'vite',       color: '646cff' },
  { id: 'electron',   label: 'Electron',   category: 'frontend', iconSlug: 'electron',   color: '47848f' },
  { id: 'flutter',    label: 'Flutter',    category: 'frontend', iconSlug: 'flutter',    color: '02569b' },
  { id: 'react-native', label: 'React Native', category: 'frontend', iconSlug: 'react',  color: '61dafb' },

  // --- Backend services --------------------------------------------------
  { id: 'nodejs',     label: 'Node.js',    category: 'service',  iconSlug: 'nodedotjs',  color: '5fa04e' },
  { id: 'express',    label: 'Express',    category: 'service',  iconSlug: 'express',    color: 'ffffff' },
  { id: 'fastify',    label: 'Fastify',    category: 'service',  iconSlug: 'fastify',    color: 'ffffff' },
  { id: 'nestjs',     label: 'NestJS',     category: 'service',  iconSlug: 'nestjs',     color: 'e0234e' },
  { id: 'django',     label: 'Django',     category: 'service',  iconSlug: 'django',     color: '092e20' },
  { id: 'fastapi',    label: 'FastAPI',    category: 'service',  iconSlug: 'fastapi',    color: '009688' },
  { id: 'flask',      label: 'Flask',      category: 'service',  iconSlug: 'flask',      color: 'ffffff' },
  { id: 'rails',      label: 'Rails',      category: 'service',  iconSlug: 'rubyonrails', color: 'cc0000' },
  { id: 'spring',     label: 'Spring Boot', category: 'service', iconSlug: 'springboot', color: '6db33f' },
  { id: 'laravel',    label: 'Laravel',    category: 'service',  iconSlug: 'laravel',    color: 'ff2d20' },
  { id: 'gin',        label: 'Go (Gin)',   category: 'service',  iconSlug: 'go',         color: '00add8' },
  { id: 'phoenix',    label: 'Phoenix',    category: 'service',  iconSlug: 'elixir',     color: '4b275f' },
  { id: 'rust-actix', label: 'Actix (Rust)', category: 'service', iconSlug: 'rust',      color: 'ffffff' },
  { id: 'dotnet',     label: '.NET',       category: 'service',  iconSlug: 'dotnet',     color: '512bd4' },
  { id: 'supabase-fn', label: 'Supabase Edge Function', category: 'service', iconSlug: 'supabase', color: '3ecf8e' },
  // simpleicons removed AWS-branded icons over copyright. Use null slug
  // so the block renders the category-coloured fallback tile instead.
  { id: 'lambda',     label: 'AWS Lambda', category: 'service',  iconSlug: null,         color: 'ff9900' },
  { id: 'cloudflare-workers', label: 'CF Workers', category: 'service', iconSlug: 'cloudflareworkers', color: 'f38020' },

  // --- Databases ---------------------------------------------------------
  { id: 'postgres',   label: 'Postgres',   category: 'database', iconSlug: 'postgresql', color: '4169e1' },
  { id: 'mysql',      label: 'MySQL',      category: 'database', iconSlug: 'mysql',      color: '4479a1' },
  { id: 'mariadb',    label: 'MariaDB',    category: 'database', iconSlug: 'mariadb',    color: '003545' },
  { id: 'sqlite',     label: 'SQLite',     category: 'database', iconSlug: 'sqlite',     color: '003b57' },
  { id: 'mongodb',    label: 'MongoDB',    category: 'database', iconSlug: 'mongodb',    color: '47a248' },
  { id: 'redis',      label: 'Redis',      category: 'database', iconSlug: 'redis',      color: 'dc382d' },
  { id: 'dynamodb',   label: 'DynamoDB',   category: 'database', iconSlug: null,         color: '4053d6' },
  { id: 'cassandra',  label: 'Cassandra',  category: 'database', iconSlug: 'apachecassandra', color: '1287b1' },
  { id: 'elasticsearch', label: 'Elasticsearch', category: 'database', iconSlug: 'elasticsearch', color: '005571' },
  { id: 'clickhouse', label: 'ClickHouse', category: 'database', iconSlug: 'clickhouse', color: 'ffcc01' },
  { id: 'snowflake',  label: 'Snowflake',  category: 'database', iconSlug: 'snowflake',  color: '29b5e8' },
  { id: 'supabase-db', label: 'Supabase Postgres', category: 'database', iconSlug: 'supabase', color: '3ecf8e' },
  { id: 'firebase',   label: 'Firestore',  category: 'database', iconSlug: 'firebase',   color: 'ffca28' },

  // --- Queues / messaging ------------------------------------------------
  { id: 'rabbitmq',   label: 'RabbitMQ',   category: 'queue',    iconSlug: 'rabbitmq',   color: 'ff6600' },
  { id: 'kafka',      label: 'Kafka',      category: 'queue',    iconSlug: 'apachekafka', color: '231f20' },
  { id: 'sqs',        label: 'AWS SQS',    category: 'queue',    iconSlug: null,         color: 'ff4f8b' },
  { id: 'pubsub',     label: 'GCP Pub/Sub', category: 'queue',   iconSlug: 'googlecloud', color: '4285f4' },
  { id: 'nats',       label: 'NATS',       category: 'queue',    iconSlug: null,         color: '27aae1' },
  { id: 'bullmq',     label: 'BullMQ',     category: 'queue',    iconSlug: 'redis',      color: 'dc382d' },
  { id: 'celery',     label: 'Celery',     category: 'queue',    iconSlug: 'celery',     color: 'a9cc54' },
  { id: 'temporal',   label: 'Temporal',   category: 'queue',    iconSlug: 'temporal',   color: '000000' },

  // --- External services -------------------------------------------------
  { id: 'stripe',     label: 'Stripe',     category: 'external', iconSlug: 'stripe',     color: '635bff' },
  { id: 'auth0',      label: 'Auth0',      category: 'external', iconSlug: 'auth0',      color: 'eb5424' },
  { id: 'clerk',      label: 'Clerk',      category: 'external', iconSlug: 'clerk',      color: '6c47ff' },
  { id: 'twilio',     label: 'Twilio',     category: 'external', iconSlug: null,         color: 'f22f46' },
  { id: 'sendgrid',   label: 'SendGrid',   category: 'external', iconSlug: 'maildotru',  color: '1a82e2' },
  { id: 'mailgun',    label: 'Mailgun',    category: 'external', iconSlug: 'mailgun',    color: 'f06b66' },
  { id: 'mapbox',     label: 'Mapbox',     category: 'external', iconSlug: 'mapbox',     color: '000000' },
  { id: 'segment',    label: 'Segment',    category: 'external', iconSlug: null,         color: '52bd95' },
  { id: 'posthog',    label: 'PostHog',    category: 'external', iconSlug: 'posthog',    color: '1d4aff' },
  { id: 'sentry',     label: 'Sentry',     category: 'external', iconSlug: 'sentry',     color: '362d59' },
  { id: 'algolia',    label: 'Algolia',    category: 'external', iconSlug: 'algolia',    color: '003dff' },
  { id: 'cloudinary', label: 'Cloudinary', category: 'external', iconSlug: 'cloudinary', color: '3448c5' },
  { id: 's3',         label: 'AWS S3',     category: 'external', iconSlug: null,         color: '569a31' },
  { id: 'r2',         label: 'CF R2',      category: 'external', iconSlug: 'cloudflare', color: 'f38020' },
  { id: 'openai',     label: 'OpenAI',     category: 'external', iconSlug: null,         color: '412991' },
  { id: 'anthropic',  label: 'Anthropic',  category: 'external', iconSlug: null,         color: 'd97757' },
  { id: 'vercel',     label: 'Vercel',     category: 'external', iconSlug: 'vercel',     color: '000000' },
  { id: 'netlify',    label: 'Netlify',    category: 'external', iconSlug: 'netlify',    color: '00c7b7' },
  { id: 'github',     label: 'GitHub',     category: 'external', iconSlug: 'github',     color: 'ffffff' }
];

/** Blank fallback per category — when user wants a custom unnamed block. */
export const BLANK_BY_CATEGORY: Record<TechCategory, TechEntry> = {
  frontend: { id: 'frontend', label: 'Frontend',  category: 'frontend', iconSlug: null, color: CATEGORY_META.frontend.color },
  service:  { id: 'service',  label: 'Service',   category: 'service',  iconSlug: null, color: CATEGORY_META.service.color },
  database: { id: 'database', label: 'Database',  category: 'database', iconSlug: null, color: CATEGORY_META.database.color },
  queue:    { id: 'queue',    label: 'Queue',     category: 'queue',    iconSlug: null, color: CATEGORY_META.queue.color },
  external: { id: 'external', label: 'External',  category: 'external', iconSlug: null, color: CATEGORY_META.external.color },
  note:     { id: 'note',     label: 'Note',      category: 'note',     iconSlug: null, color: CATEGORY_META.note.color }
};

export function iconUrl(slug: string, color = 'ffffff'): string {
  return `https://cdn.simpleicons.org/${encodeURIComponent(slug)}/${encodeURIComponent(color)}`;
}

export function searchTech(q: string, category?: TechCategory): TechEntry[] {
  const needle = q.trim().toLowerCase();
  return TECH_LIBRARY.filter((t) => {
    if (category && t.category !== category) return false;
    if (!needle) return true;
    return t.label.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle);
  });
}
