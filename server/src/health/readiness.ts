export type ReadinessResult = {
  ready: boolean;
  dependency?: string;
};

export type ReadinessProbe = () => Promise<ReadinessResult>;

export const defaultReadinessProbe: ReadinessProbe = async () => ({ ready: true });
