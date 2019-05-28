import { sify } from 'chinese-conv';

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
    try {
        const result = sify(target).toLowerCase().replace(/_/g, '-');

        return result;
    } catch (e) {
        console.log(target, ' ', e);

        return target;
    }
}

export function list2map<T extends object>(list: T[], { propAsKey }: {
    propAsKey: keyof T
}) {
    const map = list.reduce((acc, cur) => {
        const key = cur[propAsKey] as unknown as string;
        acc[key] = cur;

        return acc;
    }, {} as { [prop: string]: T });

    return map;
}

if (require.main === module) {
}
