import axios, {type AxiosRequestConfig, type AxiosResponse } from "axios";

const axiosInstance = axios.create({
    baseURL: "http://localhost:7474/api",
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
    },
});

async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res: AxiosResponse<T> = await axiosInstance.get(url, config);
    return res.data;
}

async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res: AxiosResponse<T> = await axiosInstance.post(url, data, config);
    return res.data;
}

async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res: AxiosResponse<T> = await axiosInstance.put(url, data, config);
    return res.data;
}

async function patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res: AxiosResponse<T> = await axiosInstance.patch(url, data, config);
    return res.data;
}

async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res: AxiosResponse<T> = await axiosInstance.delete(url, config);
    return res.data;
}

export const restClient = {
    get,
    post,
    put,
    patch,
    delete: del,
};