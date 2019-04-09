export function list2csv(list: any[], headerMap?: any) {
    const collumns = Object.keys(list[0] || {});

    const header = collumns.map(v => `'${headerMap ? headerMap[v] : v}'`).join(',');

    const content = list.reduce((acc, cur) => {
        acc += collumns.map(key => `'${cur[key]}'`).join(',');
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
