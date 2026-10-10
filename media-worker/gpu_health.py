import json
import torch
if not torch.cuda.is_available():
    raise RuntimeError('CUDA GPU required; no CPU fallback')
x=torch.zeros(1,device='cuda')
torch.cuda.synchronize()
print(json.dumps({'gpu':torch.cuda.get_device_name(0),'cuda':torch.version.cuda}))
