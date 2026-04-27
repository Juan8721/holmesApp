# EKS KubeSchedulerDown Alert Fix

## Problem
The `KubeSchedulerDown` alert is firing in EKS clusters because:

1. **EKS Architecture**: In Amazon EKS, the kube-scheduler runs as a managed service on the AWS-managed control plane, not as pods in the worker node cluster
2. **Missing Endpoints**: The ServiceMonitor `kube-prom-stack-kube-prome-kube-scheduler` has no endpoints because there are no scheduler pods to discover
3. **Alert Logic**: The alert `absent(up{job="kube-scheduler"})` triggers when no kube-scheduler targets are found

## Root Cause Analysis
- **Cluster Type**: EKS (Amazon Elastic Kubernetes Service)
- **Control Plane**: AWS-managed (scheduler not visible to worker nodes)
- **ServiceMonitor**: Configured but finds no targets
- **Prometheus Query**: `up{job="kube-scheduler"}` returns empty result
- **Alert Status**: Firing since 2026-04-27T15:50:15Z

## Solution
Apply the EKS-specific Prometheus rule that disables the KubeSchedulerDown alert:

```bash
kubectl apply -f k8s/prometheus-rule-eks-fix.yaml
```

This rule creates a PrometheusRule that inhibits the KubeSchedulerDown alert for EKS clusters where the scheduler is managed by AWS.

## Verification
After applying the fix:
1. The alert should stop firing within 15 minutes
2. Check alert status: `kubectl get prometheusrule eks-scheduler-fix -n observability`
3. Verify in Prometheus UI that the alert is no longer active

## Prevention
For future EKS deployments, include the EKS fix rule in the initial monitoring setup to prevent this false positive alert.