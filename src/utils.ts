import { sify } from 'chinese-conv';

export function list2csv(list: any[], map?: object | Map<any, any>) {
    let headerMap: Map<any, any> | undefined;

    if (map && map instanceof Map === false) {
        headerMap = new Map(Object.entries(map));
    } else {
        headerMap = map as Map<any, any>;
    }

    const collumns = headerMap && Array.from(headerMap.keys()) || Object.keys(list[0] || {});

    const header = collumns.map(v => `"${headerMap ? headerMap.get(v) : v}"`).join(',');

    const content = list.reduce((acc, cur) => {
        acc += collumns.map(key => `"${cur[key]}"`).join(',');
        acc += '\r\n';

        return acc;
    }, '');

    return header + '\r\n' + content;
}

export function filterUndefinedAndEmpty(obj: object | any[] | any): any {
    if (Array.isArray(obj)) {
        const r = obj.map(o => filterUndefinedAndEmpty(o)).filter(o => o);
        return r.length ? r : undefined;
    } else if (obj && typeof obj === 'object') {
        const filtered = Object.keys(obj).reduce((acc, key) => {
            const f = filterUndefinedAndEmpty(obj[key]);
            return f && (acc[key] = f), acc;
        }, {} as any);

        return Object.keys(filtered).length ? filtered : undefined;
    }

    return obj;
}

export function normalizeString(target: string) {
    const result = sify(target).toLowerCase().replace(/_/g, '-');

    return result;
}

if (require.main === module) {
    const list = [
        {
            a: 1,
            b: 2,
            c: 3,
        }
    ];

    const map = new Map([['c', 'c'], ['a', 'a'], ['b', 'b']])

    const csv = list2csv(list, map)

    console.log(csv)
}
