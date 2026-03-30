function buildProfilePatch(raw) {
  const allowed = [
    'name',
    'sex',
    'birth_date',
    'birth_time_str',
    'has_exact_time',
    'place_name',
    'lat',
    'lon',
    'tz_name'
  ];

  const patch = {};

  for (const key of allowed) {
    if (!(key in raw)) continue;

    const value = raw[key];

    if (key === 'lat' || key === 'lon') {
      if (value === null || value === undefined || value === '') {
        patch[key] = null;
      } else {
        const num = Number(value);
        patch[key] = Number.isFinite(num) ? num : null;
      }
      continue;
    }

    if (key === 'has_exact_time') {
      patch.has_exact_time =
        typeof value === 'boolean' ? value :
        typeof value === 'string' ? value.toLowerCase() === 'true' :
        typeof value === 'number' ? value !== 0 : false;
      continue;
    }

    if (key === 'birth_time_str') {
      if (value === null || value === undefined || value === '') {
        patch.birth_time_str = null;
      } else if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) {
        patch.birth_time_str = value;
      } else {
        patch.birth_time_str = null;
      }
      continue;
    }

    if (key === 'birth_date') {
      if (value != null) {
        const str = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) patch.birth_date = str;
      }
      continue;
    }

    if (value != null) {
      const str = String(value).trim();
      if (str.length) patch[key] = str;
    }
  }

  return patch;
}

module.exports = {
  buildProfilePatch
};
