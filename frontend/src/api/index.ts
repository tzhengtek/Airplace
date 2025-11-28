import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const gatewayURL = "https://airplace-gateway-4zbbjsv3.ew.gateway.dev";

// Custom error type so callers can access status and JSON body (e.g. { lastUpdated: ... })
export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    const message =
      typeof data === "object" && data !== null
        ? JSON.stringify(data)
        : String(data ?? "");
    super(message);
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = gatewayURL + "/v1/proxy-interface") {
    this.client = axios.create({
      baseURL,
      // withCredentials: true,
    });
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.get(url, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.post(url, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async drawPixel(x: number, y: number, color: number): Promise<void> {
    const userId = localStorage.getItem("discord_user_id");
    if (!userId) {
      throw new Error("User ID not found");
    }
    try {
      await this.client.post("", {
        x,
        y,
        color,
        timestamp: new Date().toISOString(),
        user: userId,
      }, 
      {
        headers: {
          'Content-Type': 'application/json'
        }}
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      if (!error.response) {
        if (error.request) {
          return new Error(`Network Error: Unable to connect to the server. Please check your connection.`);
        }
        return new Error(`Request Error: ${error.message}`);
      }

      const status = error.response.status;
      const data = error.response.data as unknown;
      return new ApiError(status, data);
    }
    return error instanceof Error ? error : new Error("Unknown error occurred");
  }
}

const apiClient = new ApiClient();

export default apiClient;
export { ApiClient };
