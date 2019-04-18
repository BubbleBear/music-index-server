"use strict";
exports.__esModule = true;
function list2csv(list, headerMap) {
    var collumns = Object.keys(headerMap || list[0] || {});
    var header = collumns.map(function (v) { return "\"" + (headerMap ? headerMap[v] : v) + "\""; }).join(',');
    var content = list.reduce(function (acc, cur) {
        acc += collumns.map(function (key) { return "\"" + cur[key] + "\""; }).join(',');
        acc += '\r\n';
        return acc;
    }, '');
    return header + '\r\n' + content;
}
exports.list2csv = list2csv;
function filterUndefinedAndEmpty(obj) {
    if (Array.isArray(obj)) {
        var r = obj.map(function (o) { return filterUndefinedAndEmpty(o); }).filter(function (o) { return o; });
        return r.length ? r : undefined;
    }
    else if (obj && typeof obj === 'object') {
        var filtered = Object.keys(obj).reduce(function (acc, key) {
            var f = filterUndefinedAndEmpty(obj[key]);
            return f && (acc[key] = f), acc;
        }, {});
        return Object.keys(filtered).length ? filtered : undefined;
    }
    return obj;
}
exports.filterUndefinedAndEmpty = filterUndefinedAndEmpty;
