import json, sys, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = json.load(open(sys.argv[1]))
fig, ax = plt.subplots(figsize=(11, 8))
xs = [p[0] for p in d['line']]; zs = [p[1] for p in d['line']]
ax.plot(xs, zs, '-', lw=1.2, color='k')
for side in ('L','R'):
    a = d.get(side)
    if a: ax.plot([p[0] for p in a],[p[1] for p in a],'-',lw=0.6,color='#888')
for m in d.get('marks', []):
    ax.plot(m[0], m[1], 'ro', ms=4); ax.annotate(m[2], (m[0], m[1]), fontsize=8, color='r')
for m in d.get('extra', []):
    ax.plot(m[0], m[1], m[3] if len(m)>3 else 'bs', ms=5); ax.annotate(m[2], (m[0], m[1]), fontsize=7, color='b')
ax.plot(xs[0], zs[0], 'g*', ms=14)
ax.set_aspect('equal'); ax.invert_yaxis(); ax.grid(alpha=.3)
plt.tight_layout(); plt.savefig(sys.argv[2], dpi=80)
