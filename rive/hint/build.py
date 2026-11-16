#!/usr/bin/env python3
"""Build scene.rml for the how-to-play hint: python3 rive/hint/build.py

Two artboards, one per input: Keys (the arrow keys) and Touch (the two halves
of the screen). Each plays the same short demo twice, then rests: press left
and the ship swings left around the square, press right and it swings right.
The rest pose is the authored pose, so a host that never starts the machine
(reduced motion) still draws the controls.

Needs motion_keys.py from the rive-animator skill: RIVE_SKILL=<skill dir>.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = Path(os.environ.get("RIVE_SKILL", Path.home() / ".claude/skills/rive-animator"))
sys.path.insert(0, str(SKILL / "scripts"))
import motion_keys as K  # noqa: E402

W, H = 220, 80
INK, SOFT, SHIP = "E6F2EFE9", "80F2EFE9", "FFFFF7EC"
LIT, DIM = "2EF2EFE9", "00F2EFE9"           # a pressed key or half brightens, then lets go
SWING, LEAN, PRESS = 1.1, 0.18, 2.5         # radians around the square, ship bank, key travel
DEMO = 210                                   # frames at 60 fps
# (down, up) frames for each press, and the orbit poses they drive: left, right, left
PRESSES = {"L": [(10, 46), (150, 176)], "R": [(70, 126)]}
ORBIT = [(0, 0), (12, 0), (48, -SWING), (72, -SWING), (128, SWING), (152, SWING), (178, 0), (DEMO, 0)]


def flow(keys):
    return K.hermite_xml(K.flow_points(keys), indent="")


def press_track(side, lit, unlit):
    """Keys for one press channel: rest, eased down in 4 frames, held, released in 8."""
    keys = [(0, unlit)]
    for down, up in PRESSES[side]:
        keys += [(down, unlit), (down + 4, lit), (up, lit), (up + 8, unlit, "out")]
    return keys + [(DEMO, unlit)]


def colors(side):
    out = []
    for f, *rest in press_track(side, LIT, DIM):
        out.append(f'<KeyFrameColor value="{rest[0]}" frame="{f}" interpolationType="linear"/>')
    return "\n".join(out)


def lean():
    """The ship banks against its swing, as in the game (Player.render)."""
    vel = lambda t: (K.flow(t + 0.5, ORBIT) - K.flow(t - 0.5, ORBIT))
    peak = max(abs(vel(t)) for t in range(DEMO))
    return K.hermite_xml(K.bake(lambda t: -LEAN * vel(t) / peak, DEMO, step=4, periodic=False), indent="")


def hold(value, color=False):
    tag = "KeyFrameColor" if color else "KeyFrameDouble"
    return f'<{tag} value="{value if color else K._num(value)}" frame="0" interpolationType="hold"/>'


def chevron(dx):
    """A Lucide-style chevron, pointing left (dx=-1) or right (dx=1)."""
    pts = [(-3 * dx, -7), (4 * dx, 0), (-3 * dx, 7)]
    verts = "\n".join(f'                <StraightVertex x="{x}" y="{y}"/>' for x, y in pts)
    return f'''            <Shape name="Chevron">
                <PointsPath isClosed="false" name="Path">
{verts}
                </PointsPath>
                <Stroke thickness="2.5" cap="round" join="round" name="Stroke">
                    <SolidColor colorValue="{INK}" name="Ink"/>
                </Stroke>
            </Shape>'''


def artboard(c, name, touch, stage_x=0):
    """c: the id client, unique per artboard. touch: halves of the screen instead of keys."""
    i = lambda n: f"{c}:{n}"
    pad = (56, 64, 14) if touch else (40, 36, 10)   # width, height, corner radius
    px = 34 if touch else 40
    sides = []
    for side, x, dx in (("L", px, -1), ("R", W - px, 1)):
        n = 20 if side == "L" else 30
        dot = f'''            <Shape name="Touch" id="{i(n + 3)}" opacity="0" scaleX="0.6" scaleY="0.6">
                <Ellipse width="34" height="34" name="Path"/>
                <Stroke thickness="2" name="Ring">
                    <SolidColor colorValue="{INK}" name="Ink"/>
                </Stroke>
            </Shape>''' if touch else ""
        chev = chevron(dx).replace("\n", "\n    ")
        sides.append(f'''        <Node x="{x}" y="{H // 2}" name="{side}" id="{i(n)}">
        <Node name="{side}Press" id="{i(n + 1)}">
    {chev}
{dot}
            <Shape name="Pad">
                <Rectangle width="{pad[0]}" height="{pad[1]}" cornerRadiusTL="{pad[2]}" cornerRadiusTR="{pad[2]}" cornerRadiusBL="{pad[2]}" cornerRadiusBR="{pad[2]}" name="Path"/>
                <Stroke thickness="1.5" name="Edge">
                    <SolidColor colorValue="{SOFT}" name="Soft"/>
                </Stroke>
                <Fill name="Fill">
                    <SolidColor colorValue="{DIM}" name="Lit" id="{i(n + 2)}"/>
                </Fill>
            </Shape>
        </Node>
        </Node>''')

    def press(side):
        n = 20 if side == "L" else 30
        ch = {}
        if touch:
            ch_dot = {18: K.track_xml(press_track(side, 1, 0), indent=""),
                      16: K.track_xml(press_track(side, 1, 0.6), indent=""),
                      17: K.track_xml(press_track(side, 1, 0.6), indent="")}
            dot = K.keyed(i(n + 3), ch_dot)
        else:
            ch[14] = K.track_xml(press_track(side, PRESS, 0), indent="")
            dot = ""
        return "\n".join(filter(None, [K.keyed(i(n + 1), ch) if ch else "", K.keyed(i(n + 2), {37: colors(side)}), dot]))

    def rest(side):
        n = 20 if side == "L" else 30
        out = [K.keyed(i(n + 2), {37: hold(DIM, color=True)})]
        out.append(K.keyed(i(n + 3), {18: hold(0), 16: hold(0.6), 17: hold(0.6)}) if touch
                   else K.keyed(i(n + 1), {14: hold(0)}))
        return "\n".join(out)

    ship = f'''        <Node x="{W // 2}" y="{H // 2}" name="Center">
            <Node name="Orbit" id="{i(10)}">
                <Node y="-22" name="ShipAt">
                    <Node name="ShipLean" id="{i(11)}">
                        <Shape name="Ship">
                            <PointsPath isClosed="true" name="Path">
                                <StraightVertex x="0" y="-6.5"/>
                                <StraightVertex x="5" y="5"/>
                                <StraightVertex x="0" y="2.5"/>
                                <StraightVertex x="-5" y="5"/>
                            </PointsPath>
                            <Fill name="Fill">
                                <SolidColor colorValue="{SHIP}" name="Ship"/>
                            </Fill>
                        </Shape>
                    </Node>
                </Node>
            </Node>
            <Shape name="Square">
                <Rectangle width="13" height="13" cornerRadiusTL="2.5" cornerRadiusTR="2.5" cornerRadiusBL="2.5" cornerRadiusBR="2.5" name="Path"/>
                <Stroke thickness="1.5" name="Edge">
                    <SolidColor colorValue="{SOFT}" name="Soft"/>
                </Stroke>
            </Shape>
        </Node>'''

    ease = '<CubicEaseInterpolator x1="0.23" y1="1" x2="0.32" y2="1"/>'
    return f'''    <Artboard defaultStateMachineId="{i(2)}" x="{stage_x}" y="0" width="{W}" height="{H}" name="{name}" styleId="{i(9)}" id="{i(1)}">
        <LayoutComponentStyle name="Artboard Style" id="{i(9)}"/>
        <Fill name="Background">
            <SolidColor colorValue="00000000" name="Clear"/>
        </Fill>
{ship}
{chr(10).join(sides)}

        <LinearAnimation duration="1" name="Rest" id="{i(3)}">
{K.keyed(i(10), {15: hold(0)})}
{K.keyed(i(11), {15: hold(0)})}
{rest("L")}
{rest("R")}
        </LinearAnimation>
        <LinearAnimation duration="{DEMO}" name="Demo" id="{i(4)}">
{K.keyed(i(10), {15: flow(ORBIT)})}
{K.keyed(i(11), {15: lean()})}
{press("L")}
{press("R")}
        </LinearAnimation>

        <StateMachine name="Hint" id="{i(2)}">
            <StateMachineLayer name="Demo" id="{i(5)}">
                <AnyState x="560" y="-120"/>
                <ExitState x="680" y="-120"/>
                <EntryState x="0" y="0"><StateTransition stateToId="{i(6)}"/></EntryState>
                <AnimationState animationId="{i(4)}" x="160" y="0" id="{i(6)}">
                    <StateTransition stateToId="{i(7)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/>
                </AnimationState>
                <AnimationState animationId="{i(4)}" x="320" y="0" id="{i(7)}">
                    <StateTransition stateToId="{i(8)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="160" interpolationType="cubic">
                        {ease}
                    </StateTransition>
                </AnimationState>
                <AnimationState animationId="{i(3)}" x="480" y="0" id="{i(8)}"/>
            </StateMachineLayer>
        </StateMachine>
    </Artboard>'''


rml = f'''<Rive version="1" kind="fragment">
{artboard(1, "Keys", touch=False)}
{artboard(2, "Touch", touch=True, stage_x=W + 40)}
</Rive>
'''
(HERE / "scene.rml").write_text(rml)
print("wrote", HERE / "scene.rml")
