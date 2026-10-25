FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY . .
RUN dotnet restore --configfile NuGet.Config --locked-mode && dotnet publish --no-restore -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://127.0.0.1:5080
ENV BRIDGE_DATA=/data
USER $APP_UID
ENTRYPOINT ["dotnet", "BridgeDemo.dll"]
