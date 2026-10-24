'use strict';

function getCommandPrefix(body, configuredPrefixes, fallbackPrefix) {
  const source = configuredPrefixes == null
    ? [fallbackPrefix]
    : Array.isArray(configuredPrefixes)
      ? configuredPrefixes
      : [configuredPrefixes];

  const prefixes = [...new Set(source.filter((prefix) => typeof prefix === 'string' && prefix.length > 0))]
    .sort((a, b) => b.length - a.length);
  return prefixes.find((prefix) => body.startsWith(prefix)) || '';
}

module.exports = getCommandPrefix;
