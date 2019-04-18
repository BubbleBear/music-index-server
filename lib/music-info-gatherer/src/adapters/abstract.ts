export interface SearchOptions {
    songName: string;
    artistName: string;
    album?: string;
}

export interface SearchReturn {
    name: string;
    artists: {
        name: string,
    }[];
    album: {
        name: string,
    }
    views?: number;
}

export interface Adapter {
    search(options: SearchOptions): Promise<SearchReturn[]>;
}

export default abstract class AbstractAdapter implements Adapter {
    public async abstract search(options: SearchOptions): Promise<SearchReturn[]>;
}
