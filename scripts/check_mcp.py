"""Exercise the actual stdio protocol through the official MCP client."""
import asyncio
import argparse
import json
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def data_of(response):
    data = response.structured_content
    if data is None:
        data = json.loads(response.content[0].text)
    return data["result"] if "result" in data and "status" not in data else data


async def check(connection, workflow):
    config = StdioServerParameters(command=sys.executable, args=["-m", "ryancad.mcp_server", "--connection", connection, "--name", "MCP acceptance agent"], cwd=str(Path.cwd()))
    async with stdio_client(config) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            capability = await session.call_tool("cad_capabilities", {})
            data = capability.structured_content
            if data is None:
                data = json.loads(capability.content[0].text)
            if "result" in data and isinstance(data["result"], dict):
                data = data["result"]
            print(json.dumps({"tools": [tool.name for tool in tools.tools], "capabilities_keys": list(data), "schema": data.get("schema_version")}))
            current = data["session"]
            result = await session.call_tool("cad_execute", {"name": "document.rename", "args": {"name": "Silicone mold · printed tooling"}, "expected_revision": current["revision"], "request_id": "mcp-acceptance-" + str(current["revision"]), "wait_seconds": 20})
            if result.is_error:
                raise AssertionError(result)
            payload = result.structured_content
            if payload is None:
                payload = json.loads(result.content[0].text)
            if "result" in payload and "status" not in payload:
                payload = payload["result"]
            assert payload["status"] == "complete" and payload["result"]["saved"], payload
            print("MCP command response received through stdio.")
            if workflow:
                state = data_of(await session.call_tool("cad_inspect", {}))
                assert not state["document"]["features"], "Use an empty isolated project for --workflow."
                revision = state["document"]["revision"]

                async def execute(name, args):
                    nonlocal revision
                    output = data_of(await session.call_tool("cad_execute", {"name":name,"args":args,"expected_revision":revision}))
                    assert output["status"] == "complete" and output["result"]["saved"], output
                    revision = output["result"]["revision"]
                    return output["result"]

                plate = await execute("feature.create", {"type":"box","component_name":"Agent plate","values":{"length":80,"width":40,"height":6}})
                await execute("feature.create", {"type":"holes","owner":plate["component_id"],"values":{"diameter":6,"count_x":2,"count_y":2,"x":-32,"y":-12,"spacing_x":64,"spacing_y":24}})
                await execute("feature.create", {"type":"fillet","owner":plate["component_id"],"values":{"radius":2},"options":{"selector":{"group":"vertical"}}})
                pin = await execute("feature.create", {"type":"cylinder","component_name":"Agent pin","values":{"diameter":5.7,"height":10,"x":-32,"y":-12}})
                await execute("component.duplicate", {"id":pin["component_id"],"placement":{"x":64}})
                final = data_of(await session.call_tool("cad_inspect", {}))
                assert final["summary"]["instances"] == 3 and final["summary"]["definitions"] == 2
                assert all(action["actor"]["kind"] == "agent" for action in final["actions"])
                exported = data_of(await session.call_tool("cad_export_stl", {"expected_revision":revision}))
                assert exported["status"] == "complete" and len(exported["result"]["files"]) == 3, exported
                report = {"official_stdio_client":True,"discovered_tools":len(tools.tools),"authored_modeling_steps":5,"instances":3,"definitions":2,"separate_validated_stls":3}
                Path("artifacts/mcp-workflow.json").write_text(json.dumps(report, indent=2), "utf-8")
                print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--connection", default="runtime/connection.json")
    parser.add_argument("--workflow", action="store_true")
    args = parser.parse_args()
    asyncio.run(check(args.connection, args.workflow))
