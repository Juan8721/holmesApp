# EKS Controller Manager Monitoring Fix

## Problem
The KubeControllerManagerDown alert is firing because the kube-controller-manager is not accessible for monitoring in EKS clusters. In EKS (Amazon Elastic Kubernetes Service), the control plane components including kube-controller-manager are managed by AWS and are not directly accessible from worker nodes.

## Root Cause Analysis
1. **EKS Architecture**: In EKS, control plane components run on AWS-managed infrastructure, not as pods on worker nodes
2. **No Static Pods**: Unlike self-managed clusters, EKS doesn't expose controller manager as static pods
3. **Service Discovery Failure**: The ServiceMonitor expects to find controller manager endpoints at port 10257, but these don't exist in EKS
4. **Alert Configuration**: The Prometheus alert rule `absent(up{job="kube-controller-manager"})` fires when no targets are found

## Evidence from Investigation
- No controller manager pods found in kube-system namespace
- Service `kube-prom-stack-kube-prome-kube-controller-manager` has no endpoints
- EKS cluster confirmed (Server Version: v1.30.14-eks-bbe087e)
- Prometheus targets show no kube-controller-manager job

## Solution Options

### Option 1: Disable the Alert (Recommended for EKS)
Since EKS manages the controller manager, this alert is not applicable and should be disabled.

### Option 2: Use Alternative Monitoring
Monitor EKS control plane through AWS CloudWatch metrics instead of direct Prometheus scraping.

## Implementation
This fix implements Option 1 by adding a condition to exclude EKS clusters from the controller manager monitoring.