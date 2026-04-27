## EKS Control Plane Monitoring Configuration

This directory contains Helm values to properly configure kube-prometheus-stack for EKS clusters.

In EKS, the control plane components (kube-scheduler, kube-controller-manager, etcd) are managed by AWS and not accessible for Prometheus scraping. The default kube-prometheus-stack configuration assumes self-managed clusters and creates ServiceMonitors for these components, causing false alerts.

### Files:
- `kube-prometheus-stack-values.yaml` - Helm values to disable EKS control plane monitoring