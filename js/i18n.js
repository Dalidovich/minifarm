(function () {
  MF.locales = {};

  MF.i18n = {
    lang: 'en',
    detect: function () {
      const nav = (navigator.language || 'en').toLowerCase();
      return nav.indexOf('ru') === 0 ? 'ru' : 'en';
    },
    set: function (lang) {
      MF.i18n.lang = MF.locales[lang] ? lang : 'en';
      document.documentElement.lang = MF.i18n.lang;
    },
    has: function (key) {
      return MF.locales[MF.i18n.lang][key] !== undefined || MF.locales.en[key] !== undefined;
    }
  };

  MF.t = function (key, params) {
    let text = MF.locales[MF.i18n.lang][key];
    if (text === undefined) text = MF.locales.en[key];
    if (text === undefined) return key;
    if (params) {
      Object.keys(params).forEach(function (name) {
        text = text.split('{' + name + '}').join(params[name]);
      });
    }
    return text;
  };
})();
