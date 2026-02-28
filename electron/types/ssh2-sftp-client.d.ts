declare module "ssh2-sftp-client" {
  type ConnectOptions = {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string | Buffer;
    passphrase?: string;
  };

  export default class SftpClient {
    connect(options: ConnectOptions): Promise<unknown>;
    exists(path: string): Promise<false | "d" | "-" | "l">;
    mkdir(path: string, recursive?: boolean): Promise<unknown>;
    put(input: Buffer | string, remotePath: string): Promise<unknown>;
    end(): Promise<void>;
  }
}
