export interface FilterEmptyOption {
    inplace: boolean;
}

export function filterEmpty(object: Object | Array<any> | any, options: FilterEmptyOption = {
    inplace: false,
}) {
    let filtered: Object | Array<any> | any;

    if (Array.isArray(object)) {
        ;
    } else if (object && typeof object === 'object') {
        ;
    } else {
        ;
    }

    return filtered;
}

export function parseSetCookie(setCookie: string[]) {
    return setCookie.map(ck => {
        const match = ck.match(/([^;]*)/);
        return match ? match[1] : '';
    }).reduce((acc, cur) => {
        const sep = cur.split('=');
        const k = sep[0];
        const val = sep[1];
        acc[k] = val;

        return acc;
    }, {} as any);
}

export function trim(target: string, options: {
    // direction: 'left' | 'right' | 'both',
    pattern: string,
} = { pattern: ' ' }) {

    if (typeof target !== 'string') {
        throw new TypeError('the first argument must be \'string\' type');
    }

    const s = options.pattern
        .replace('\\', '\\\\')
        .replace(' ', '\\s')
        .replace('\n', '\\n')
        .replace('\r', '\\r')

    const pattern = new RegExp(`[${s}]*(.*)`);

    const result = pattern.exec(pattern.exec(target)![1])![1];

    return result;
}

if (require.main === module) {
    const t = parseSetCookie(['xmgid=296b2d08-9f2d-47b1-a2e4-0b960aef0214; path=/; expires=Sat, 09 Apr 2022 09:30:50 GMT; domain=.xiami.com; httponly',
        'xm_sg_tk=476cf9afe6728893c625dbc044d0d669_1554888650596; path=/; expires=Fri, 12 Apr 2019 09:30:50 GMT; domain=.xiami.com; secure',
        'xm_sg_tk.sig=7q1MF1CUqqeI1cnc8kSWua4y6wHhuQWrVfkH8hBJwJw; path=/; expires=Fri, 12 Apr 2019 09:30:50 GMT; domain=.xiami.com; secure']);

    console.log(t);

    const str = `
    One Man's Dream
`;

    const trimmed = trim(str, {
        pattern: ' \r\n'
    });

    // console.log(trimmed);
}
