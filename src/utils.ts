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
