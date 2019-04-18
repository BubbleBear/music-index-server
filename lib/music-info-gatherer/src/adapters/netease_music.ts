import AbstractAdapter, { SearchOptions, SearchReturn } from './abstract';
import { encrypt } from '../lib/netease_cypher';

import axios, { AxiosRequestConfig } from 'axios';

export default class NeteaseMusicAdapter extends AbstractAdapter {
    private async fetch({ url, method, data }: AxiosRequestConfig): Promise<any> {
        return await axios({
            method: method || 'post',
            url,
            responseType: 'json',
            baseURL: 'https://music.163.com/',
            data,
        });
    }

    public async search(options: SearchOptions) {
        const searchArgsStr = `{"hlpretag":"<span class=\\"s-fc7\\">","hlposttag":"</span>","s":"${options.songName} ${options.artistName}","type":"1","offset":"0","total":"true","limit":"30","csrf_token":""}`;

        const postData = encrypt(searchArgsStr);

        const postDataStr = Object.keys(postData).reduce((acc, key) => {
            const value: string = (postData as any)[key];
            acc.push(`${key}=${encodeURIComponent(value)}`);
            return acc;
        }, [] as string[]).join('&');

        const response = await this.fetch({ url: '/weapi/cloudsearch/get/web?csrf_token=', data: postDataStr});
        
        const results = response.data.result.songs.map(async (v: any) => {
            return {
                name: v.name,
                artists: v.ar.map((u: any) => {
                    return {
                        name: u.name,
                        id: u.id,
                    };
                }),
                album: {
                    name: v.al.name,
                    id: v.al.id,
                },
                id: v.id,
                url: `https://music.163.com/#/song?id=${v.id}`,
                comments: await this.commentCount(v.id),
            };
        });

        return await Promise.all<SearchReturn>(results);
    }

    public async commentCount(songId: number | string) {
        const searchArgsStr = `{csrf_token: "",limit: "20",offset: "0",rid: "R_SO_4_${songId}",total: "true"}`;

        const postData = encrypt(searchArgsStr);

        const postDataStr = Object.keys(postData).reduce((acc, key) => {
            const value: string = (postData as any)[key];
            acc.push(`${key}=${encodeURIComponent(value)}`);
            return acc;
        }, [] as string[]).join('&');

        const response = await this.fetch({ url: `/weapi/v1/resource/comments/R_SO_4_${songId}?csrf_token=`, data: postDataStr});

        return response.data.total
    }
}

if (require.main === module) {
    !async function () {
        const a = new NeteaseMusicAdapter();
        const r = await a.search({ songName: '好心分手', artistName: '卢巧音' });
        console.dir(r, {
            depth: 4,
        })
    }()
}
