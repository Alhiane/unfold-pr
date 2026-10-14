<?php
namespace App\Http\Controllers;

class LogOutOtherSessionsController
{
    public function __construct(private readonly AuthenticationService $auth)
    {
    }

    public function __invoke(Request $request)
    {
        $this->auth->logOutOtherSessions($request->user());
        return $this->noContent();
    }

    private function noContent()
    {
        return response()->noContent();
    }
}
