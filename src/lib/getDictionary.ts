import 'server-only';

const dictionaries = {
    en: () => import('../../messages/en.json').then((module) => module.default),
    de: () => import('../../messages/de.json').then((module) => module.default),
};

export const getDictionary = async (locale: 'en' | 'de') => {
    if (dictionaries[locale]) {
        return dictionaries[locale]();
    }
    return dictionaries.en();
};
