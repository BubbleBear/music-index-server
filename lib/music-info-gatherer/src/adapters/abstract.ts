export interface AdapterOptions {
    proxy?: string;
}
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
        name?: string,
    }
    views?: number;
}

export interface Adapter {
    search(options: SearchOptions): Promise<SearchReturn[]>;
}

export default abstract class AbstractAdapter implements Adapter {
    protected proxy: string | undefined;

    constructor(options: AdapterOptions) {
        this.proxy = options.proxy;
    };

    public async abstract search(options: SearchOptions): Promise<SearchReturn[]>;
}
