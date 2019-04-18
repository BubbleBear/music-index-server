import * as fs from 'fs';

import ItunesAdapter from './adapters/itunes';
import KkboxAdapter from './adapters/kkbox';
import NeteaseMusicAdapter from './adapters/netease_music';
import QQMusicAdapter from './adapters/qq_music';
import SpotifyAdapter from './adapters/spotify';
import YoutubeAdapter from './adapters/youtube';

const itunes = new ItunesAdapter;
const kkbox = new KkboxAdapter;
const netease = new NeteaseMusicAdapter;
const qq = new QQMusicAdapter;
const spotify = new SpotifyAdapter;
const youtube = new YoutubeAdapter;

async function retry(tag: string, fn: Function, times: number = 5) {
    const errorBuffer = [];

    while (times--) {
        try {
            return await fn();
        } catch (e) {
            errorBuffer.push(e);
        }
    }

    console.log(tag, errorBuffer.map(e => e.message));
    return [];
}

export async function search(songName: string, artistName: string) {
    const p = { songName, artistName };

    const results: any = {};

    await Promise.all([
        retry('itunes', async () => results.itunes = await itunes.search(p), 5),
        retry('kkbox', async () => results.kkbox = await kkbox.search(p), 5),
        retry('netease', async () => results.netease = await netease.search(p), 5),
        retry('qq', async () => results.qq = await qq.search(p), 5),
        retry('spotify', async () => results.spotify = await spotify.search(p), 5),
        // retry('youtube', async () => results.youtube = await youtube.search(p), 5),
    ]);

    return results;
}

if (require.main === module) {
    !async function() {
        const r = await search('好心分手', '卢巧音');
        const ws = fs.createWriteStream('x.json');
        ws.write(JSON.stringify(r));
        ws.end();
    }()
}
